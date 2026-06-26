/**
 * Editor sheets — Vela's panel set, driven by the store's `panel` state.
 * Bottom sheets: Insert · Audio · Video Settings · Project menu · Editor
 * Preferences. Full-screen: Filter · Export. Real actions wire to the store /
 * pickers; visual-only controls (filters, export sliders, prefs effects) are
 * tagged "soon". Export runs the real upload→render→Photos pipeline.
 */
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { font, mono, vela, RATIOS, ratioLabel } from '../constants';
import { VIcon, type VIconName } from './VIcon';
import { VSlider } from './VSlider';
import { ColorSheet } from './ColorSheet';
import { FontPickerSheet } from './FontPickerSheet';
import { FILTER_LIST } from '../filters/registry';
import type { ClipFilter, TextAlign, TransitionType } from '../model/types';
import { clipAtTime } from '../model/editor-ops';
import type { VisualTrackClip } from '../model/types';
import { videoThumbnail } from '../storage/media';
import { pickAndAddAudio, pickAndAddMedia, pickAndAddOverlay } from '../media/pick';
import { effectsTarget, useEditor } from '../store/editorStore';

const soon = (label: string) => Alert.alert('Coming soon', `${label} is coming soon.`);

// ---- shared bits ---------------------------------------------------------

function VToggle({ value, onChange, offColor = vela.toggleOff }: { value: boolean; onChange?: () => void; offColor?: string }) {
  const knob = value ? '#fff' : offColor === '#fff' ? vela.textDim : '#fff';
  return (
    <Pressable onPress={onChange} style={[s.tgTrack, { backgroundColor: value ? vela.action : offColor }]}>
      <View style={[s.tgKnob, { backgroundColor: knob, left: value ? 22 : 2 }]} />
    </Pressable>
  );
}

function BottomSheet({ onClose, children, style, dim }: { onClose: () => void; children: React.ReactNode; style?: object; dim?: string }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[s.backdrop, dim ? { backgroundColor: dim } : null]} onPress={onClose}>
        <Pressable style={[s.sheet, style]} onPress={() => {}}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FullSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={s.full}>{children}</View>
    </Modal>
  );
}

function StaticSlider({ fill, knobSize = 18 }: { fill: number; knobSize?: number }) {
  return (
    <View style={s.sliderTrack}>
      <View style={[s.sliderFill, { width: `${Math.round(fill * 100)}%` }]} />
      <View style={[s.sliderKnob, { width: knobSize, height: knobSize, borderRadius: knobSize / 2, left: `${Math.round(fill * 100)}%`, marginLeft: -knobSize / 2 }]} />
    </View>
  );
}

// ---- Video Settings ------------------------------------------------------

function VideoSettingsSheet() {
  const project = useEditor((s) => s.project)!;
  const setRatio = useEditor((s) => s.setRatio);
  const sourceDims = useEditor((s) => s.sourceDims);
  const setPanel = useEditor((s) => s.setPanel);
  const close = () => setPanel(null);

  const options = sourceDims
    ? [{ key: 'orig', label: 'Original', width: sourceDims.width, height: sourceDims.height }, ...RATIOS]
    : RATIOS;

  return (
    <BottomSheet onClose={close}>
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Video Settings</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={24} color="#fff" />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.ratioRow}>
        {options.map((r) => {
          const on = r.width === project.width && r.height === project.height;
          const fg = on ? '#111' : vela.textDim;
          return (
            <Pressable key={r.key} style={[s.ratioCard, on && s.ratioCardOn]} onPress={() => setRatio(r.width, r.height)}>
              <View style={[s.ratioBox, { borderColor: fg }]} />
              <Text style={[s.ratioLabel, { color: fg }]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={s.infoCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.infoTitle}>
            HDR <Text style={s.soonInline}>soon</Text>
          </Text>
          <Text style={s.infoSub}>Automatically converts your clip to an HDR video</Text>
        </View>
        <VToggle value={false} />
      </View>
    </BottomSheet>
  );
}

// ---- Project menu --------------------------------------------------------

function ProjectMenuSheet() {
  const name = useEditor((s) => s.name);
  const project = useEditor((s) => s.project)!;
  const setName = useEditor((s) => s.setName);
  const setPoster = useEditor((s) => s.setPoster);
  const setPanel = useEditor((s) => s.setPanel);
  const shareExport = useEditor((s) => s.shareExport);
  const close = () => setPanel(null);

  function rename() {
    close();
    Alert.prompt(
      'Rename project',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (t?: string) => t && setName(t) },
      ],
      'plain-text',
      name,
    );
  }

  async function setCover() {
    close();
    const st = useEditor.getState();
    const mainTrack = st.project?.tracks?.find((t) => t.kind === 'visual');
    const c = mainTrack ? (clipAtTime(mainTrack, st.playheadSec) as VisualTrackClip | undefined) : undefined;
    if (!c) {
      Alert.alert('Cover', 'Add a video or image first, move the playhead, then set a cover.');
      return;
    }
    if (c.type === 'image') {
      setPoster(c.src);
      Alert.alert('Cover set', 'Project cover updated.');
      return;
    }
    const t = await videoThumbnail(c.src, (c.trimIn ?? 0) + (st.playheadSec - c.start));
    if (t) {
      setPoster(t);
      Alert.alert('Cover set', 'Project cover updated to the current frame.');
    } else {
      Alert.alert('Cover', 'Could not capture the frame.');
    }
  }

  return (
    <BottomSheet onClose={close} style={s.menuSheet}>
      <View style={s.menuHeader}>
        <View>
          <Text style={s.menuTitle} numberOfLines={1}>{name || 'Untitled'}</Text>
          <Text style={s.menuSub}>{ratioLabel(project.width, project.height)}</Text>
        </View>
        <Pressable onPress={rename} hitSlop={10}>
          <VIcon name="pencil" size={24} color="#fff" />
        </Pressable>
      </View>
      <View style={s.menuDivider} />
      <Pressable style={s.menuRow} onPress={rename}>
        <VIcon name="pencil" size={24} color="#fff" />
        <Text style={s.menuRowText}>Rename</Text>
      </Pressable>
      <Pressable style={s.menuRow} onPress={setCover}>
        <VIcon name="image" size={24} color="#fff" />
        <Text style={s.menuRowText}>Set cover</Text>
      </Pressable>
      <Pressable style={s.menuRow} onPress={() => { close(); shareExport(); }}>
        <VIcon name="export" size={24} color="#fff" />
        <Text style={s.menuRowText}>Share Project</Text>
      </Pressable>
      <Pressable style={s.menuRow} onPress={() => soon('Create Template')}>
        <VIcon name="templates" size={24} color={vela.muted} />
        <Text style={[s.menuRowText, { color: vela.muted }]}>Create Template</Text>
        <View style={s.soonPill}><Text style={s.soonPillText}>soon</Text></View>
      </Pressable>
    </BottomSheet>
  );
}

// ---- Insert / Audio grids ------------------------------------------------

interface GridItem { label: string; bg: string; icon: VIconName; onPress: () => void; }

function GridSheet({ title, items, tall }: { title: string; items: GridItem[]; tall?: boolean }) {
  const setPanel = useEditor((s) => s.setPanel);
  return (
    <BottomSheet onClose={() => setPanel(null)}>
      <View style={s.handle} />
      <Text style={s.gridTitle}>{title}</Text>
      <View style={s.grid}>
        {items.map((it) => (
          <Pressable key={it.label} style={[s.gridCard, { backgroundColor: it.bg, height: tall ? 128 : 104 }]} onPress={it.onPress}>
            <VIcon name={it.icon} size={tall ? 34 : 28} color="#fff" strokeWidth={1.9} />
            <Text style={s.gridLabel}>{it.label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

function InsertSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const addText = useEditor((s) => s.addText);
  const items: GridItem[] = [
    { label: 'Photos', bg: '#37b6f0', icon: 'photos', onPress: () => { setPanel(null); void pickAndAddMedia(); } },
    { label: 'Audio', bg: '#6d4aff', icon: 'audio', onPress: () => setPanel('audio') },
    { label: 'Text', bg: '#15b8a6', icon: 'text', onPress: () => { setPanel(null); addText(); } },
    { label: 'Sticker', bg: '#c04af0', icon: 'sticker', onPress: () => { setPanel(null); void pickAndAddOverlay(); } },
    { label: 'Effects', bg: '#ff5a5f', icon: 'effects', onPress: () => soon('Effects') },
    { label: 'Record', bg: '#ff8a3d', icon: 'record', onPress: () => soon('Record') },
  ];
  return <GridSheet title="Add to timeline" items={items} />;
}

function AudioSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const items: GridItem[] = [
    { label: 'Music', bg: '#6d4aff', icon: 'audio', onPress: () => { setPanel(null); void pickAndAddAudio(); } },
    { label: 'Sound FX', bg: '#c04af0', icon: 'soundfx', onPress: () => soon('Sound FX') },
    { label: 'Record', bg: '#ff5a5f', icon: 'record', onPress: () => soon('Record') },
  ];
  return <GridSheet title="Insert audio" items={items} tall />;
}

// ---- Editor Preferences --------------------------------------------------

const FPS_STEPS = [24, 25, 30, 50, 60];

function PrefsSheet() {
  const prefs = useEditor((s) => s.prefs);
  const setPref = useEditor((s) => s.setPref);
  const setPanel = useEditor((s) => s.setPanel);
  const close = () => setPanel(null);
  const fpsIdx = Math.max(0, FPS_STEPS.indexOf(prefs.previewFps));

  return (
    <BottomSheet onClose={close} style={s.prefsSheet}>
      <View style={s.rowBetween}>
        <Text style={s.prefsTitle}>Editor Preferences</Text>
        <Pressable onPress={close} hitSlop={10}>
          <VIcon name="check" size={26} color="#fff" />
        </Pressable>
      </View>

      <Text style={s.prefsSection}>Tracks</Text>
      <View style={s.prefsCard}>
        <View style={s.prefRow}>
          <VIcon name="prefTracks" size={24} color={vela.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={s.prefName}>Main Track Mode</Text>
            <Text style={s.prefSub}>Fluid timeline; auto-snapping enabled.</Text>
          </View>
          <View style={s.segment}>
            {(['Quick', 'Pro'] as const).map((m) => (
              <Pressable key={m} onPress={() => setPref('mainTrack', m)} style={[s.segItem, prefs.mainTrack === m && s.segItemOn]}>
                <Text style={s.segText}>{m}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={s.prefDivider} />
        <View style={s.prefRow}>
          <VIcon name="prefLinkage" size={24} color={vela.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={s.prefName}>Track Linkage</Text>
            <Text style={s.prefSub}>Other elements move or delete with main clips.</Text>
          </View>
          <VToggle value={prefs.linkage} onChange={() => setPref('linkage', !prefs.linkage)} />
        </View>
      </View>

      <Text style={s.prefsSection}>Canvas</Text>
      <View style={[s.prefsCard, s.prefRow]}>
        <VIcon name="prefSnap" size={24} color={vela.textDim} />
        <View style={{ flex: 1 }}>
          <Text style={s.prefName}>Object Snapping</Text>
          <Text style={s.prefSub}>When off, objects snap only to edges or center.</Text>
        </View>
        <VToggle value={prefs.snapping} onChange={() => setPref('snapping', !prefs.snapping)} offColor="#fff" />
      </View>

      <Text style={s.prefsSection}>Preview</Text>
      <View style={s.prefsCard}>
        <View style={[s.prefRow, { marginBottom: 14 }]}>
          <VIcon name="prefFps" size={24} color={vela.textDim} />
          <Text style={s.prefName}>Preview FPS</Text>
        </View>
        <StaticSlider fill={fpsIdx / (FPS_STEPS.length - 1)} />
        <View style={s.fpsRow}>
          {FPS_STEPS.map((v) => (
            <Pressable key={v} onPress={() => setPref('previewFps', v)}>
              <Text style={[s.fpsLabel, prefs.previewFps === v && s.fpsLabelOn]}>{v}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

// ---- Filter (live grade) -------------------------------------------------

const FILTER_SWATCH: Record<string, readonly [string, string]> = {
  none: ['#9a9aa2', '#5e5e68'],
  vivid: ['#ff5a5f', '#2f7bff'],
  warm: ['#f2c14e', '#c04a2a'],
  cool: ['#37b6f0', '#2f3a8a'],
  mono: ['#cfcfd6', '#3a3a42'],
  fade: ['#d9c3a4', '#9a9aa2'],
  film: ['#8a6d4a', '#3a2a20'],
};
const r2 = (n: number) => Math.round(n * 100) / 100;

function AdjustRow({ label, value, min, max, onChange, fmt }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fmt: (v: number) => string }) {
  return (
    <View style={s.adjustRow}>
      <Text style={s.adjustLabel}>{label}</Text>
      <View style={{ flex: 1 }}>
        <VSlider value={value} min={min} max={max} onChange={onChange} />
      </View>
      <Text style={s.adjustVal}>{fmt(value)}</Text>
    </View>
  );
}

function FilterSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipFilter = useEditor((s) => s.applyClipFilter);
  const close = () => setPanel(null);
  const [filter, setFilter] = useState<ClipFilter>(() => effectsTarget()?.clip.filter ?? {});
  const [tab, setTab] = useState<'filter' | 'adjust'>('filter');
  const apply = (f: ClipFilter) => {
    setFilter(f);
    applyClipFilter(Object.keys(f).length ? f : undefined);
  };
  const preset = filter.preset ?? 'none';
  const intensity = filter.intensity ?? 1;

  return (
    <BottomSheet onClose={close} style={s.filterSheet} dim="#0002">
      <View style={s.rowBetween}>
        <View style={{ flexDirection: 'row', gap: 26 }}>
          <Pressable onPress={() => setTab('filter')}><Text style={tab === 'filter' ? s.fTabOn : s.fTabOff}>Filter</Text></Pressable>
          <Pressable onPress={() => setTab('adjust')}><Text style={tab === 'adjust' ? s.fTabOn : s.fTabOff}>Adjust</Text></Pressable>
        </View>
        <Pressable onPress={close} hitSlop={10}><VIcon name="check" size={24} color="#fff" /></Pressable>
      </View>

      {tab === 'filter' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterThumbRow}>
            {FILTER_LIST.map(({ key, label }) => {
              const on = preset === key;
              return (
                <Pressable key={key} style={s.filterThumb} onPress={() => apply(key === 'none' ? {} : { preset: key, intensity })}>
                  <LinearGradient colors={FILTER_SWATCH[key] ?? FILTER_SWATCH.none} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.filterThumbImg, on && s.filterThumbOn]} />
                  <Text style={[s.filterThumbLabel, on && s.filterThumbLabelOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {preset !== 'none' ? (
            <View style={s.intensityRow}>
              <Text style={s.intensityLabel}>Intensity</Text>
              <View style={{ flex: 1 }}><VSlider value={intensity} min={0} max={1} onChange={(v) => apply({ ...filter, intensity: r2(v) })} /></View>
              <Text style={s.intensityVal}>{Math.round(intensity * 100)}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={{ gap: 2 }}>
          <AdjustRow label="Brightness" value={filter.brightness ?? 0} min={-0.5} max={0.5} onChange={(v) => apply({ ...filter, brightness: r2(v) })} fmt={(v) => `${Math.round(v * 100)}`} />
          <AdjustRow label="Contrast" value={filter.contrast ?? 1} min={0.5} max={1.8} onChange={(v) => apply({ ...filter, contrast: r2(v) })} fmt={(v) => v.toFixed(2)} />
          <AdjustRow label="Saturation" value={filter.saturation ?? 1} min={0} max={2.5} onChange={(v) => apply({ ...filter, saturation: r2(v) })} fmt={(v) => v.toFixed(2)} />
          <AdjustRow label="Temperature" value={filter.temperature ?? 0} min={-1} max={1} onChange={(v) => apply({ ...filter, temperature: r2(v) })} fmt={(v) => `${Math.round(v * 100)}`} />
        </View>
      )}
    </BottomSheet>
  );
}

// ---- Export (full screen) ------------------------------------------------

function ExportSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const exportToPhotos = useEditor((s) => s.exportToPhotos);
  const [quality, setQuality] = useState<'Auto' | 'Manual'>('Manual');
  const [audioOnly, setAudioOnly] = useState(false);
  const [hdr, setHdr] = useState(false);
  const close = () => setPanel(null);

  return (
    <FullSheet onClose={close}>
      <View style={{ height: 54 }} />
      <View style={s.exportTopRow}>
        <Pressable onPress={close} hitSlop={10}><VIcon name="close" size={26} color="#fff" /></Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
        <View style={s.exportThumbWrap}>
          <View style={s.exportThumbFrame}>
            <LinearGradient colors={['#d9c3a4', '#8a6d4a']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.exportThumbInner} />
          </View>
        </View>
        <View style={s.exportBody}>
          <View style={s.rowBetween}>
            <View style={s.rowBaseline}>
              <Text style={s.exportH}>Export Settings</Text>
              <Text style={s.exportHmono}>4K / 30fps</Text>
            </View>
            <View style={s.segment}>
              {(['Auto', 'Manual'] as const).map((q) => (
                <Pressable key={q} onPress={() => setQuality(q)} style={[s.segItem, quality === q && s.segItemOn]}>
                  <Text style={s.segText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[s.rowBetween, { marginTop: 24 }]}>
            <Text style={s.exportToggleLabel}>Export Audio Only</Text>
            <VToggle value={audioOnly} onChange={() => setAudioOnly((v) => !v)} offColor="#fff" />
          </View>
          <View style={[s.rowBetween, { marginTop: 22 }]}>
            <Text style={s.exportToggleLabel}>HDR <Text style={s.soonInline}>soon</Text></Text>
            <VToggle value={hdr} onChange={() => setHdr((v) => !v)} offColor="#fff" />
          </View>

          <Text style={s.exportField}>Resolution <Text style={s.soonInline}>soon</Text></Text>
          <StaticSlider fill={1} knobSize={22} />
          <View style={s.scaleRow}>
            {['480p', '720p', '1080p', '2.7K', '4K'].map((v, i) => (
              <Text key={v} style={[s.scaleLabel, i === 4 && s.scaleLabelOn]}>{v}</Text>
            ))}
          </View>

          <Text style={s.exportField}>FPS <Text style={s.soonInline}>soon</Text></Text>
          <StaticSlider fill={0.5} knobSize={22} />
          <View style={s.scaleRow}>
            {['24', '25', '30', '50', '60'].map((v, i) => (
              <Text key={v} style={[s.scaleLabel, i === 2 && s.scaleLabelOn]}>{v}</Text>
            ))}
          </View>

          <View style={[s.rowBetween, { marginTop: 8 }]}>
            <Text style={s.exportField}>Average Bitrate (Mbps)</Text>
            <Text style={s.bitrateChip}>23.2</Text>
          </View>
          <StaticSlider fill={0.15} knobSize={22} />
          <View style={s.scaleRow}>
            <Text style={s.scaleLabel}>1.0 Mbps</Text>
            <Text style={s.scaleLabel}>150.0 Mbps</Text>
          </View>

          <View style={[s.rowBaseline, { marginTop: 20 }]}>
            <Text style={s.exportH}>Estimated File Size</Text>
            <Text style={s.exportHmono}>~ render dependent</Text>
          </View>
        </View>
      </ScrollView>
      <Pressable style={s.exportBtn} onPress={exportToPhotos}>
        <Text style={s.exportBtnText}>Export</Text>
      </Pressable>
    </FullSheet>
  );
}

// ---- Text edit (live input + toolbar) ------------------------------------

const ALIGN_ORDER: TextAlign[] = ['left', 'center', 'right'];

function TextEditSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const selected = useEditor((s) => s.selected);
  const editSelectedText = useEditor((s) => s.editSelectedText);
  const updateOverlay = useEditor((s) => s.updateSelectedOverlay);
  const ov = useEditor((s) => s.project?.overlays.find((o) => o.id === selected?.clipId));
  const projW = useEditor((s) => s.project?.width ?? 1080);
  const [text, setText] = useState(ov?.text ?? '');
  const [tool, setTool] = useState<'kb' | 'size'>('kb');
  const [showColor, setShowColor] = useState(false);
  const [showFont, setShowFont] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const close = () => setPanel(null);
  const onChange = (t: string) => {
    setText(t);
    editSelectedText(t);
  };

  const color = ov?.color ?? '#ffffff';
  const fontSize = ov?.fontSize ?? Math.round(projW * 0.07);
  const align = ov?.align ?? 'center';
  const bold = ov?.bold ?? false;
  const cycleAlign = () => updateOverlay({ align: ALIGN_ORDER[(ALIGN_ORDER.indexOf(align) + 1) % 3] });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1 }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.teWrap} pointerEvents="box-none">
          <View style={s.tePanel}>
            {tool === 'kb' ? (
              <View style={s.teInputRow}>
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={onChange}
                  autoFocus
                  multiline
                  placeholder="Input Title"
                  placeholderTextColor={vela.muted2}
                  style={s.teInput}
                />
                <Pressable onPress={() => onChange('')} hitSlop={8} style={s.teTrash}>
                  <VIcon name="trash" size={22} color={vela.muted} />
                </Pressable>
              </View>
            ) : (
              <View style={s.teSizeRow}>
                <Text style={s.teSizeLabel}>Size</Text>
                <View style={{ flex: 1 }}>
                  <VSlider value={fontSize} min={16} max={Math.round(projW * 0.3)} step={2} onChange={(v) => updateOverlay({ fontSize: Math.round(v) })} />
                </View>
                <Text style={s.teSizeVal}>{Math.round(fontSize)}</Text>
              </View>
            )}
            <View style={s.teToolbar}>
              <Pressable onPress={() => { setTool('kb'); inputRef.current?.focus(); }} style={s.teTool}>
                <VIcon name="keyboard" size={24} color={tool === 'kb' ? '#fff' : vela.textLight} />
                {tool === 'kb' ? <View style={s.teKbUnderline} /> : null}
              </Pressable>
              <Pressable onPress={() => setShowFont(true)}><VIcon name="font" size={24} color={vela.textLight} /></Pressable>
              <Pressable onPress={() => setTool('size')} style={s.teTool}>
                <VIcon name="fontsize" size={24} color={tool === 'size' ? '#fff' : vela.textLight} />
                {tool === 'size' ? <View style={s.teKbUnderline} /> : null}
              </Pressable>
              <Pressable onPress={() => setShowColor(true)}>
                <View style={[s.teColor, { backgroundColor: color, borderWidth: 2, borderColor: '#fff' }]} />
              </Pressable>
              <Pressable onPress={cycleAlign}><VIcon name="format" size={24} color={vela.textLight} /></Pressable>
              <Pressable onPress={() => soon('Spacing')}><VIcon name="spacing" size={24} color={vela.textLight} /></Pressable>
              <Pressable onPress={() => updateOverlay({ bold: !bold })}><VIcon name="style" size={24} color={bold ? vela.accent : vela.textLight} /></Pressable>
              <View style={s.teDivider} />
              <Pressable onPress={close}><VIcon name="check" size={24} color="#fff" /></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
      {showColor ? <ColorSheet value={color} onChange={(hex) => updateOverlay({ color: hex })} onClose={() => setShowColor(false)} /> : null}
      {showFont ? <FontPickerSheet value={ov?.fontFamily} onChange={(family) => updateOverlay({ fontFamily: family })} onClose={() => setShowFont(false)} /> : null}
    </Modal>
  );
}

// ---- Transition ----------------------------------------------------------

const TRANSITIONS: { key: TransitionType; label: string; soon?: boolean }[] = [
  { key: 'cut', label: 'None' },
  { key: 'fade', label: 'Fade' },
  { key: 'dissolve', label: 'Dissolve', soon: true },
  { key: 'slide', label: 'Slide', soon: true },
  { key: 'wipe', label: 'Wipe', soon: true },
  { key: 'zoom', label: 'Zoom', soon: true },
];

function TransitionSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const setSelectedTransition = useEditor((s) => s.setSelectedTransition);
  const selected = useEditor((s) => s.selected);
  const current = useEditor((s) => {
    const tr = (s.project?.tracks ?? []).find((t) => t.id === selected?.trackId);
    const c = tr?.kind === 'visual' ? tr.clips.find((x) => x.id === selected?.clipId) : undefined;
    return c?.transitionIn;
  });
  const close = () => setPanel(null);
  const [dur, setDur] = useState(current?.duration ?? 0.5);
  const type: TransitionType = current?.type ?? 'cut';

  const apply = (key: TransitionType) => {
    setSelectedTransition(key === 'cut' ? undefined : { type: key, duration: dur });
  };

  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Transition</Text>
        <Pressable onPress={close} hitSlop={10}><VIcon name="check" size={24} color="#fff" /></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingVertical: 2 }}>
        {TRANSITIONS.map((t) => {
          const on = type === t.key;
          return (
            <Pressable key={t.key} style={s.trItem} onPress={() => (t.soon ? soon(t.label) : apply(t.key))}>
              <View style={[s.trIcon, on && s.trIconOn]}>
                <VIcon name={t.key === 'cut' ? 'close' : 'fx'} size={22} color={on ? '#111' : '#fff'} />
              </View>
              <Text style={[s.trLabel, on && { color: vela.select }]}>{t.label}</Text>
              {t.soon ? <View style={s.trSoon}><Text style={s.trSoonText}>soon</Text></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {type !== 'cut' ? (
        <View style={s.intensityRow}>
          <Text style={s.intensityLabel}>Duration</Text>
          <View style={{ flex: 1 }}>
            <VSlider value={dur} min={0.2} max={2} onChange={(v) => { const d = Math.round(v * 10) / 10; setDur(d); setSelectedTransition({ type, duration: d }); }} />
          </View>
          <Text style={s.intensityVal}>{dur.toFixed(1)}s</Text>
        </View>
      ) : null}
    </BottomSheet>
  );
}

// ---- Speed / Volume ------------------------------------------------------

function SpeedSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipSpeed = useEditor((s) => s.applyClipSpeed);
  const [speed, setSpeed] = useState(() => effectsTarget()?.clip.speed ?? 1);
  const close = () => setPanel(null);
  const set = (v: number) => {
    setSpeed(v);
    applyClipSpeed(v);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Speed</Text>
        <Pressable onPress={close} hitSlop={10}><VIcon name="check" size={24} color="#fff" /></Pressable>
      </View>
      <View style={s.intensityRow}>
        <Text style={s.intensityLabel}>Speed</Text>
        <View style={{ flex: 1 }}><VSlider value={speed} min={0.25} max={4} onChange={(v) => set(Math.round(v * 100) / 100)} /></View>
        <Text style={s.intensityVal}>{speed.toFixed(2)}×</Text>
      </View>
      <View style={s.chipRow}>
        {[0.5, 1, 2, 3].map((v) => (
          <Pressable key={v} onPress={() => set(v)} style={[s.chip, speed === v && s.chipOn]}>
            <Text style={[s.chipText, speed === v && { color: '#111' }]}>{v}×</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

function VolumeSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const applyClipVolume = useEditor((s) => s.applyClipVolume);
  const [vol, setVol] = useState(() => {
    const { selected, project } = useEditor.getState();
    const tracks = project?.tracks ?? [];
    if (selected) {
      const tr = tracks.find((t) => t.id === selected.trackId);
      const c = tr?.clips.find((x) => x.id === selected.clipId);
      if (c) return c.volume ?? 1;
    }
    return effectsTarget()?.clip.volume ?? 1;
  });
  const close = () => setPanel(null);
  const set = (v: number) => {
    setVol(v);
    applyClipVolume(v);
  };
  return (
    <BottomSheet onClose={close} style={{ gap: 16 }} dim="#0002">
      <View style={s.rowBetween}>
        <Text style={s.sheetTitle}>Volume</Text>
        <Pressable onPress={close} hitSlop={10}><VIcon name="check" size={24} color="#fff" /></Pressable>
      </View>
      <View style={s.intensityRow}>
        <Text style={s.intensityLabel}>Volume</Text>
        <View style={{ flex: 1 }}><VSlider value={vol} min={0} max={2} onChange={(v) => set(Math.round(v * 20) / 20)} /></View>
        <Text style={s.intensityVal}>{Math.round(vol * 100)}%</Text>
      </View>
    </BottomSheet>
  );
}

// ---- Export progress -----------------------------------------------------

function ExportProgressModal() {
  const exporting = useEditor((s) => s.exporting);
  const exportMsg = useEditor((s) => s.exportMsg);
  return (
    <Modal visible={exporting} transparent animationType="fade">
      <View style={s.progressBackdrop}>
        <View style={s.progressCard}>
          <ActivityIndicator color={vela.accent} size="large" />
          <Text style={s.progressMsg}>{exportMsg}</Text>
        </View>
      </View>
    </Modal>
  );
}

// ---- host ----------------------------------------------------------------

export function EditorSheets() {
  const panel = useEditor((s) => s.panel);
  return (
    <>
      {panel === 'settings' && <VideoSettingsSheet />}
      {panel === 'editmenu' && <ProjectMenuSheet />}
      {panel === 'insert' && <InsertSheet />}
      {panel === 'audio' && <AudioSheet />}
      {panel === 'prefs' && <PrefsSheet />}
      {panel === 'filter' && <FilterSheet />}
      {panel === 'export' && <ExportSheet />}
      {panel === 'textedit' && <TextEditSheet />}
      {panel === 'transition' && <TransitionSheet />}
      {panel === 'speed' && <SpeedSheet />}
      {panel === 'volume' && <VolumeSheet />}
      <ExportProgressModal />
    </>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: vela.sheet, padding: 18, paddingBottom: 34, borderTopLeftRadius: 26, borderTopRightRadius: 26, gap: 14 },
  full: { flex: 1, backgroundColor: vela.editorBg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowBaseline: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sheetTitle: { color: '#fff', fontFamily: font.bold, fontSize: 17 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#3a3a42', alignSelf: 'center', marginBottom: 2 },
  soonInline: { color: vela.muted2, fontSize: 10, fontFamily: font.bold },

  // toggle
  tgTrack: { width: 50, height: 30, borderRadius: 15, justifyContent: 'center' },
  tgKnob: { position: 'absolute', top: 2, width: 26, height: 26, borderRadius: 13 },

  // slider
  sliderTrack: { height: 4, backgroundColor: vela.toggleOff, borderRadius: 2, justifyContent: 'center' },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: vela.action, borderRadius: 2 },
  sliderKnob: { position: 'absolute', backgroundColor: '#fff', top: '50%', marginTop: -9 },

  // video settings
  ratioRow: { gap: 12, paddingVertical: 2 },
  ratioCard: { width: 78, height: 78, borderRadius: 14, backgroundColor: vela.card3, alignItems: 'center', justifyContent: 'center', gap: 8 },
  ratioCardOn: { backgroundColor: '#fff' },
  ratioBox: { width: 24, height: 30, borderWidth: 2, borderRadius: 4 },
  ratioLabel: { fontSize: 13, fontFamily: font.bold },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: vela.card3, borderRadius: 16, padding: 16, marginTop: 2 },
  infoTitle: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  infoSub: { color: vela.muted2, fontSize: 12.5, marginTop: 3, maxWidth: 230 },

  // project menu
  menuSheet: { backgroundColor: vela.card, gap: 0, paddingTop: 24, paddingHorizontal: 22 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18 },
  menuTitle: { color: '#fff', fontFamily: font.extrabold, fontSize: 22, maxWidth: 260 },
  menuSub: { color: vela.muted5, fontSize: 15, marginTop: 5 },
  menuDivider: { height: 1, backgroundColor: vela.divider, marginBottom: 6 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  menuRowText: { color: '#fff', fontSize: 18, fontFamily: font.semibold },
  soonPill: { marginLeft: 'auto', backgroundColor: vela.card2, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
  soonPillText: { color: vela.muted2, fontSize: 10, fontFamily: font.bold },

  // grids
  gridTitle: { color: '#fff', fontFamily: font.bold, fontSize: 17, textAlign: 'center', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridCard: { width: '31.5%', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 10 },
  gridLabel: { color: '#fff', fontFamily: font.semibold, fontSize: 14 },

  // prefs
  prefsSheet: { backgroundColor: vela.card, maxHeight: '82%' },
  prefsTitle: { color: '#fff', fontFamily: font.bold, fontSize: 19 },
  prefsSection: { color: vela.muted2, fontSize: 13, fontFamily: font.semibold },
  prefsCard: { backgroundColor: vela.card2, borderRadius: 16, padding: 16 },
  prefRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  prefDivider: { height: 1, backgroundColor: '#3a3a42', marginVertical: 14 },
  prefName: { color: '#fff', fontFamily: font.bold, fontSize: 17 },
  prefSub: { color: vela.muted2, fontSize: 13, marginTop: 3 },
  segment: { flexDirection: 'row', backgroundColor: '#3a3a42', borderRadius: 11, padding: 3 },
  segItem: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 9 },
  segItemOn: { backgroundColor: '#5a5a64' },
  segText: { color: '#fff', fontFamily: font.semibold, fontSize: 14 },
  fpsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  fpsLabel: { color: vela.muted2, fontFamily: mono.regular, fontSize: 12 },
  fpsLabelOn: { color: '#fff' },

  // filter
  filterPreviewWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  filterPreviewFrame: { width: 200, height: 340, borderRadius: 6, backgroundColor: '#fff', padding: 7 },
  filterPreviewInner: { flex: 1, borderRadius: 3 },
  filterPanel: { backgroundColor: vela.sheet, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingVertical: 16, paddingBottom: 28 },
  filterTabs: { flexDirection: 'row', justifyContent: 'center', gap: 40, marginBottom: 18 },
  filterTabOn: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  filterTabOff: { color: vela.muted3, fontFamily: font.semibold, fontSize: 16 },
  filterCatRow: { gap: 26, paddingHorizontal: 22, paddingBottom: 14 },
  filterCat: { color: vela.muted2, fontFamily: font.semibold, fontSize: 15 },
  filterCatOn: { color: '#fff' },
  filterThumbRow: { gap: 12, paddingHorizontal: 18, paddingBottom: 14 },
  filterThumb: { width: 62, alignItems: 'center', gap: 6 },
  filterThumbImg: { width: 62, height: 78, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  filterThumbOn: { borderColor: vela.select },
  filterThumbLabel: { fontSize: 11, color: vela.muted, fontFamily: font.medium },
  filterThumbLabelOn: { color: vela.select, fontFamily: font.bold },
  intensityRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4, paddingVertical: 6 },
  intensityLabel: { color: '#fff', fontSize: 14, fontFamily: font.medium },
  intensityVal: { color: '#fff', fontFamily: mono.regular, fontSize: 14, minWidth: 34, textAlign: 'right' },
  filterActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 8 },
  applyAll: { color: vela.muted, fontFamily: font.semibold, fontSize: 15 },

  trItem: { width: 62, alignItems: 'center', gap: 7 },
  trIcon: { width: 56, height: 56, borderRadius: 14, backgroundColor: vela.card3, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  trIconOn: { backgroundColor: vela.select, borderColor: vela.select },
  trLabel: { color: vela.muted, fontSize: 12, fontFamily: font.medium },
  trSoon: { position: 'absolute', top: -3, right: 4, backgroundColor: vela.card2, borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
  trSoonText: { color: vela.muted2, fontSize: 8, fontFamily: font.bold },

  chipRow: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, height: 40, borderRadius: 10, backgroundColor: vela.card3, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: vela.select },
  chipText: { color: '#fff', fontFamily: font.semibold, fontSize: 14 },

  filterSheet: { gap: 14 },
  fTabOn: { color: '#fff', fontFamily: font.bold, fontSize: 16 },
  fTabOff: { color: vela.muted3, fontFamily: font.semibold, fontSize: 16 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  adjustLabel: { color: vela.textLight, fontSize: 14, fontFamily: font.medium, width: 86 },
  adjustVal: { color: '#fff', fontFamily: mono.regular, fontSize: 13, minWidth: 40, textAlign: 'right' },

  // export
  exportTopRow: { paddingHorizontal: 22, paddingTop: 8 },
  exportThumbWrap: { alignItems: 'center', paddingVertical: 14 },
  exportThumbFrame: { width: 148, height: 264, borderRadius: 4, backgroundColor: '#fff', padding: 5 },
  exportThumbInner: { flex: 1, borderRadius: 2 },
  exportBody: { paddingHorizontal: 22 },
  exportH: { color: '#fff', fontFamily: font.extrabold, fontSize: 17 },
  exportHmono: { color: vela.muted, fontFamily: mono.regular, fontSize: 13 },
  exportToggleLabel: { color: '#fff', fontFamily: font.extrabold, fontSize: 19 },
  exportField: { color: '#fff', fontFamily: font.semibold, fontSize: 17, marginTop: 22, marginBottom: 14 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  scaleLabel: { color: vela.muted2, fontSize: 13 },
  scaleLabelOn: { color: '#fff' },
  bitrateChip: { backgroundColor: vela.card2, color: '#fff', fontFamily: mono.regular, fontSize: 15, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  exportBtn: { height: 58, borderRadius: 14, backgroundColor: vela.action, alignItems: 'center', justifyContent: 'center', marginHorizontal: 22, marginBottom: 30 },
  exportBtnText: { color: '#fff', fontFamily: font.bold, fontSize: 19 },

  // text edit
  teWrap: { flex: 1, justifyContent: 'flex-end' },
  tePanel: { backgroundColor: vela.editorBg, paddingTop: 12, paddingBottom: 8 },
  teInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  teInput: { flex: 1, backgroundColor: '#2a2a30', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 16, fontFamily: font.medium, maxHeight: 88 },
  teTrash: { padding: 4 },
  teToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 16 },
  teTool: { alignItems: 'center', gap: 4 },
  teKbUnderline: { width: 16, height: 2, borderRadius: 1, backgroundColor: '#fff' },
  teSizeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56 },
  teSizeLabel: { color: '#fff', fontSize: 14, fontFamily: font.medium },
  teSizeVal: { color: '#fff', fontFamily: mono.regular, fontSize: 14, minWidth: 34, textAlign: 'right' },
  teColor: { width: 26, height: 26, borderRadius: 13 },
  teDivider: { width: 1, height: 24, backgroundColor: '#3a3a42' },

  // export progress
  progressBackdrop: { flex: 1, backgroundColor: '#000c', alignItems: 'center', justifyContent: 'center' },
  progressCard: { backgroundColor: vela.sheet, borderRadius: 16, padding: 28, alignItems: 'center', gap: 14, minWidth: 200 },
  progressMsg: { color: '#fff', fontSize: 15, fontFamily: font.medium },
});
