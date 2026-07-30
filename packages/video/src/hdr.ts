/**
 * HDR10 output — and the difference between converting and relabelling.
 *
 * The first version of this did the second thing. It stamped the output
 * `-color_primaries bt2020 -color_trc smpte2084 -colorspace bt2020nc` plus x265
 * `hdr10=1`, and that was all: no filter anywhere in the graph touched the
 * pixels. The compositor hands the encoder plain Rec.709 SDR in 8-bit, ffmpeg
 * promoted it to 10-bit with a bit shift — no transfer or gamut maths, just
 * `<< 2` — and the file went out claiming to be PQ BT.2020.
 *
 * A player believes the label. iOS Photos applied a PQ EOTF to gamma-2.2 values
 * and read 709 primaries as 2020, so every warm tone detonated into pure
 * saturated red while blues, sitting near the 2020 blue primary, came through
 * almost untouched. Skin went scarlet. That is what a mistagged file looks like,
 * and it is why the conversion below exists.
 *
 * What this does NOT do: invent dynamic range. Every source reaches the encoder
 * as 8-bit SDR because the compositor flattens it there, so the result is a
 * correct HDR10 file carrying SDR content — it looks the same as the SDR export
 * (which is the point; anything else would be a false colour), and it gains
 * 10-bit precision and a wider container. Genuinely preserving the range of HDR
 * footage would mean carrying HDR through the whole compositor, which is a
 * different and much larger piece of work.
 */

/**
 * Rec.709 SDR → BT.2020 PQ, in a single zscale hop.
 *
 * Two details here were found by running it, not by reasoning, and both are
 * load-bearing:
 *
 * 1. **The input properties are stated explicitly.** Frames reaching the end of
 *    our filtergraph are tagged `unspecified`, and zimg refuses to guess: split
 *    this into the usual linearize-then-convert chain and the second hop dies
 *    with `code 3074: no path between colorspaces`. Being explicit also stops
 *    the export depending on whatever tagging the user's footage carried, which
 *    is the same class of bug this module exists to fix.
 *
 * 2. **It is one hop, not three.** The familiar recipe (`t=linear` → float →
 *    convert) is for going the other way, and every variant of it failed here
 *    for the reason above. zimg linearizes internally in float anyway, so a
 *    single conversion is both simpler and more accurate.
 *
 * `npl=100` says SDR white is 100 nits, the reference. That is what makes the
 * HDR file look like the SDR one rather than dim or blown out.
 *
 * Measured against Debian's ffmpeg (the build production ships), round-tripping
 * known colours out to BT.2020 PQ and back to 709:
 *
 *   | colour  | SDR 4:2:0 today | this, 4:2:0 | this, 4:4:4 |
 *   |---------|-----------------|-------------|-------------|
 *   | orange  | 3               | 1           | 0           |
 *   | skin    | 2               | 3           | 0           |
 *   | blue    | 2               | 4           | 0           |
 *   | red     | 1               | 2           | 6           |
 *   | green   | 2               | 27          | 0           |
 *
 * So the colour maths itself is exact to ≤6/255, and at 4:2:0 it costs about
 * what an SDR export already costs — except on a fully saturated primary, where
 * chroma subsampling in the wider 2020 gamut reaches 27/255. That is inherent to
 * 4:2:0 rather than to this conversion, and it is the same order as the grade's
 * documented ≤6–10/255.
 *
 * Through a real HEVC encode and back, a skin tone went 200/137/105 →
 * 203/143/107. Compare the relabelled version, which took the same tone to
 * 255/0/0.
 */
export const HDR_CONVERT_FILTER = [
  "zscale=tin=bt709:pin=bt709:min=bt709:rin=tv" +
    ":t=smpte2084:p=bt2020:m=bt2020nc:r=tv:npl=100",
  "format=yuv420p10le",
].join(",");

/**
 * The filter the conversion needs, and the reason HDR can be unavailable.
 *
 * `zscale` comes from libzimg and is a build-time option (`--enable-libzimg`).
 * Debian's ffmpeg package has it, so production does; Homebrew's default build
 * does NOT, so a Mac dev server usually cannot encode HDR. The `colorspace`
 * filter is not a fallback — its transfer list stops at `bt2020-12` and it
 * cannot emit PQ at all.
 */
export const HDR_REQUIRED_FILTER = "zscale";

/** Whether an `ffmpeg -filters` listing includes what HDR needs. */
export function supportsHdr(filterList: string): boolean {
  return new RegExp(`(^|\\s)${HDR_REQUIRED_FILTER}(\\s|$)`, "m").test(
    filterList,
  );
}

/** What to tell someone whose ffmpeg cannot do this. */
export const HDR_UNSUPPORTED_MESSAGE =
  "This server's ffmpeg was built without zscale (libzimg), so it cannot produce " +
  "HDR10. Export in SDR, or run a build with --enable-libzimg.";

/**
 * HDR10 static metadata for x265.
 *
 * The primaries are BT.2020's, in the 0.00002 units the spec uses. The
 * luminance is the honest part: `L(1000000,1)` is a 100-nit peak, because SDR
 * white mapped at `npl=100` is exactly 100 nits and nothing in the frame can
 * exceed it. Claiming the usual 1000 would tell a display to expect highlights
 * that are not there, and it would tone-map for them.
 *
 * `max-cll` is deliberately absent. It is a measurement — the brightest pixel
 * and the brightest frame average in the actual content — and we have not
 * measured it. An invented value is worse than none: a display trusts it.
 */
const MASTER_DISPLAY =
  "G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(1000000,1)";

export const HDR_X265_PARAMS = [
  "colorprim=bt2020",
  "transfer=smpte2084",
  "colormatrix=bt2020nc",
  "hdr10=1",
  // Repeat the headers on every keyframe, so a player that joins mid-stream —
  // or a file cut without re-encoding — still learns it is HDR.
  "repeat-headers=1",
  `master-display=${MASTER_DISPLAY}`,
].join(":");
