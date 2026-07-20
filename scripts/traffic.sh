#!/usr/bin/env bash
# Cumulative traffic report for namemasker.com from the host's standard
# Apache access logs. Runs entirely over SSH; only aggregates come back —
# visitor IPs are counted on the server and never printed or stored here.
#
# Each run merges whatever days the host still has into a private history
# on this machine (~/.namemasker/), newest data winning per day, then
# prints one report across all recorded days. The host rotates logs after
# a few days, so run this at least every few days to keep history whole.
#
# This is the whole analytics stack, on purpose. The site itself ships no
# trackers, no analytics JS, no extra requests — the charter forbids them,
# and the trust tests on the site would fail otherwise. The security page
# discloses exactly this: standard server logs, aggregate counts only.
# Requires an SSH alias "namemasker-web" in ~/.ssh/config (kept out of
# this public repo).
set -euo pipefail

HIST_DIR="${NAMEMASKER_TRAFFIC_DIR:-$HOME/.namemasker}"
mkdir -p "$HIST_DIR"
DAYS_FILE="$HIST_DIR/traffic-days.tsv"       # iso-day  pv  visitors  model  security
REFS_FILE="$HIST_DIR/traffic-referrers.tsv"  # iso-day  count  referrer
touch "$DAYS_FILE" "$REFS_FILE"

fresh=$(ssh -o BatchMode=yes namemasker-web '
  cd ~/logs/namemasker.com/http 2>/dev/null || exit 0
  zcat -f access.log* 2>/dev/null | awk '"'"'
    function isbot(line) {
      return (line ~ /[Bb]ot|[Cc]rawl|[Ss]pider|curl|wget|python-requests|HeadlessChrome/)
    }
    {
      split($4, dt, ":"); day = substr(dt[1], 2)
      path = $7; status = $9; ref = $11
      if ($6 != "\"GET" || status < 200 || status >= 400) next
      if (isbot($0)) next
      seen_day[day] = 1
      if (path == "/" || path == "/index.html") pv[day]++
      if (path ~ /security\.html/) sec[day]++
      if (path ~ /model_int8\.onnx/) model[day]++
      uniq[day "|" $1] = 1
      if (ref !~ /namemasker\.com/ && ref != "\"-\"" && ref != "\"\"")
        refs[day "|" ref]++
    }
    END {
      for (k in uniq) { split(k, a, "|"); u[a[1]]++ }
      for (d in seen_day)
        printf "DAY\t%s\t%d\t%d\t%d\t%d\n", d, pv[d], u[d], model[d], sec[d]
      for (k in refs) {
        split(k, a, "|")
        printf "REF\t%s\t%d\t%s\n", a[1], refs[k], a[2]
      }
    }
  '"'"'
' 2>/dev/null)

# Apache day (18/Jul/2026) -> ISO (2026-07-18) for stable sorting.
to_iso='BEGIN {
    split("Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec", mn, " ")
    for (i = 1; i <= 12; i++) m[mn[i]] = sprintf("%02d", i)
  }
  function iso(d,  a) { split(d, a, "/"); return a[3] "-" m[a[2]] "-" a[1] }'

printf '%s\n' "$fresh" | awk -F'\t' -v OFS='\t' "$to_iso"'
  $1 == "DAY" { print iso($2), $3, $4, $5, $6 }' > "$HIST_DIR/.new-days"
printf '%s\n' "$fresh" | awk -F'\t' -v OFS='\t' "$to_iso"'
  $1 == "REF" { print iso($2), $3, $4 }' > "$HIST_DIR/.new-refs"

# Merge: freshly-observed days replace their stored rows; older days persist.
cat "$DAYS_FILE" "$HIST_DIR/.new-days" \
  | awk -F'\t' '{ row[$1] = $0 } END { for (k in row) print row[k] }' \
  | sort > "$HIST_DIR/.merged-days"
mv "$HIST_DIR/.merged-days" "$DAYS_FILE"

awk -F'\t' 'NR == FNR { seen[$1] = 1; next } !($1 in seen)' \
  "$HIST_DIR/.new-refs" "$REFS_FILE" > "$HIST_DIR/.kept-refs"
cat "$HIST_DIR/.kept-refs" "$HIST_DIR/.new-refs" | sort > "$HIST_DIR/.merged-refs"
mv "$HIST_DIR/.merged-refs" "$REFS_FILE"
rm -f "$HIST_DIR/.new-days" "$HIST_DIR/.new-refs" "$HIST_DIR/.kept-refs"

# One report over everything recorded.
awk -F'\t' '
  BEGIN { printf "%-12s %10s %10s %12s %10s\n", "day", "pageviews", "visitors", "model-pulls", "security" }
  {
    printf "%-12s %10d %10d %12d %10d\n", $1, $2, $3, $4, $5
    pv += $2; vis += $3; mod += $4; sec += $5
  }
  END {
    printf "%-12s %10s %10s %12s %10s\n", "", "----", "----", "----", "----"
    printf "%-12s %10d %10d %12d %10d\n", "total", pv, vis, mod, sec
  }' "$DAYS_FILE"

if [ -s "$REFS_FILE" ]; then
  printf '\ntop external referrers (all time):\n'
  awk -F'\t' '{ n[$3] += $2 } END { for (r in n) printf "%6d  %s\n", n[r], r }' "$REFS_FILE" \
    | sort -rn | head -10
fi
