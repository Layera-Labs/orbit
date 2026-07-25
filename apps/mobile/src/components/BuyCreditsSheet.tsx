/**
 * Buy credit packs via RevenueCat. Purchases are granted server-side by the
 * RevenueCat webhook, so after the store flow completes we poll the balance a few
 * times to reflect the grant. Shows a friendly "not available yet" state until
 * RevenueCat is configured (see `net/purchases.ts` / `REVENUECAT_API_KEY`).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, vela } from '../constants';
import { VIcon } from './VIcon';
import { BottomSheet } from './BottomSheet';
import { useEditor } from '../store/editorStore';
import { buyPack, getCreditPacks, purchasesAvailable, type CreditPack } from '../net/purchases';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function BuyCreditsSheet() {
  const setPanel = useEditor((s) => s.setPanel);
  const credits = useEditor((s) => s.credits);
  const refreshCredits = useEditor((s) => s.refreshCredits);

  const [packs, setPacks] = useState<CreditPack[] | null>(null);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const close = () => setPanel(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = purchasesAvailable() ? await getCreditPacks() : [];
        if (alive) setPacks(p);
      } catch {
        if (alive) setPacks([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const buy = async (pack: CreditPack) => {
    if (buyingId) return;
    setBuyingId(pack.id);
    setErr(null);
    try {
      await buyPack(pack);
      // The webhook grants credits asynchronously — poll the balance briefly.
      for (let i = 0; i < 4; i++) {
        await sleep(1500);
        await refreshCredits();
      }
      close();
    } catch (e) {
      if ((e as { userCancelled?: boolean })?.userCancelled) {
        setBuyingId(null);
        return; // user backed out — no error
      }
      setErr('That purchase didn’t complete. Please try again.');
      setBuyingId(null);
    }
  };

  return (
    <BottomSheet onClose={close} style={{ backgroundColor: vela.lightCard, gap: 14, paddingBottom: 24 }} dim='#0005'>
      <View style={s.head}>
        <Text style={s.title}>Get credits</Text>
        <View style={s.creditPill}>
          <VIcon name="bolt" size={12} color={vela.accent} strokeWidth={2.2} />
          <Text style={s.creditText}>{credits == null ? '—' : credits}</Text>
        </View>
      </View>

      {packs === null ? (
        <View style={s.center}><ActivityIndicator color={vela.accent} /></View>
      ) : packs.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyText}>Buying credits isn’t available yet.</Text>
        </View>
      ) : (
        packs.map((pack) => (
          <Pressable key={pack.id} style={s.pack} onPress={() => buy(pack)} disabled={!!buyingId}>
            <View style={{ flex: 1 }}>
              <Text style={s.packTitle}>{pack.title}</Text>
              <Text style={s.packSub}>{pack.price}</Text>
            </View>
            {buyingId === pack.id ? <ActivityIndicator color={vela.accent} /> : <VIcon name="chevronRight" size={18} color={vela.muted3} />}
          </Pressable>
        ))
      )}

      {err ? <Text style={s.err}>{err}</Text> : null}
      <Text style={s.note}>Credits are added to your account after purchase.</Text>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  creditPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: vela.accentSoft },
  creditText: { color: vela.accent, fontFamily: font.semibold, fontSize: 12.5 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  emptyText: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 14, textAlign: 'center' },
  pack: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: vela.lightSurface, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 16 },
  packTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 16 },
  packSub: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
  note: { color: vela.lightMuted, fontFamily: font.regular, fontSize: 12, textAlign: 'center' },
});
