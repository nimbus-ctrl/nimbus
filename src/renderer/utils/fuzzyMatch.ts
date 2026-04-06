/**
 * Smart fuzzy matcher that prioritises contiguous and word-boundary matches.
 *
 * Matching tiers (highest → lowest priority):
 *  1. Exact prefix of the full text          ("cle" → "Clear Terminal")
 *  2. Exact prefix of a word                 ("ter" → "Clear Terminal")
 *  3. Contiguous substring anywhere           ("lear" → "Clear Terminal")
 *  4. Initials / word-start subsequence       ("ct"  → "Clear Terminal")
 *  5. General subsequence (greedy)            ("cltr" → "Clear Terminal")
 *
 * Returns { match, score }. Higher score = better relevance.
 */
export function fuzzyMatch(
  query: string,
  text: string,
): { match: boolean; score: number } {
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  if (q.length === 0) return { match: true, score: 0 }
  if (q.length > t.length) return { match: false, score: 0 }

  // ── Tier 1: exact prefix ──────────────────────────────────────────────────
  if (t.startsWith(q)) {
    return { match: true, score: 100 + q.length }
  }

  // ── Tier 2: word-start prefix ─────────────────────────────────────────────
  // Split into words, check if query is a prefix of any word
  const words = t.split(/[\s\-:.]+/)
  for (let w = 0; w < words.length; w++) {
    if (words[w].startsWith(q)) {
      // Earlier word = higher score
      return { match: true, score: 80 + q.length - w * 2 }
    }
  }

  // ── Tier 3: contiguous substring ──────────────────────────────────────────
  const substringIdx = t.indexOf(q)
  if (substringIdx !== -1) {
    // Earlier position = higher score
    return { match: true, score: 60 + Math.max(0, 10 - substringIdx) }
  }

  // ── Tier 4: word-start initials ───────────────────────────────────────────
  // e.g. "ct" matches "Clear Terminal" (C...T)
  if (q.length <= words.length) {
    let qi = 0
    for (let w = 0; w < words.length && qi < q.length; w++) {
      if (words[w].length > 0 && words[w][0] === q[qi]) {
        qi++
      }
    }
    if (qi === q.length) {
      return { match: true, score: 40 + q.length }
    }
  }

  // ── Tier 5: general subsequence ───────────────────────────────────────────
  let qi = 0
  let score = 0
  let prevMatchIdx = -2

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive chars bonus
      if (ti === prevMatchIdx + 1) score += 3
      // Word boundary bonus
      if (ti === 0 || /[\s\-:.]/.test(t[ti - 1])) score += 2
      prevMatchIdx = ti
      qi++
    }
  }

  if (qi < q.length) return { match: false, score: 0 }

  return { match: true, score: 10 + score }
}
