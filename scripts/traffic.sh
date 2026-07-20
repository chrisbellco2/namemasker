#!/usr/bin/env bash
# Aggregate traffic report for namemasker.com from the host's standard
# Apache access logs. Runs entirely over SSH; only aggregates come back —
# visitor IPs are counted on the server and never printed or stored here.
#
# This is the whole analytics stack, on purpose. The site itself ships no
# trackers, no analytics JS, no extra requests — the charter forbids them,
# and the trust tests on the site would fail otherwise. Requires an SSH
# alias "namemasker-web" in ~/.ssh/config (kept out of this public repo).
set -euo pipefail

ssh -o BatchMode=yes namemasker-web '
  cd ~/logs/namemasker.com/http 2>/dev/null || { echo "no logs yet"; exit 0; }
  zcat -f access.log* 2>/dev/null | awk '"'"'
    {
      # Apache combined: IP - - [dd/Mon/yyyy:...] "METH path HTTP/x" status size "referer" "ua"
      split($4, dt, ":"); day = substr(dt[1], 2)
      path = $7; status = $9; ref = $11
      if ($6 != "\"GET" || status < 200 || status >= 400) next
      if (ua_is_bot($0)) next
      if (path == "/" || path == "/index.html") { pv[day]++; total_pv++ }
      if (path ~ /security\.html/) sec[day]++
      if (path ~ /model_int8\.onnx/) model[day]++
      uniq[day "|" $1] = 1
      if (ref !~ /namemasker\.com/ && ref != "\"-\"" && ref != "\"\"" ) refs[ref]++
    }
    function ua_is_bot(line) {
      return (line ~ /[Bb]ot|[Cc]rawl|[Ss]pider|curl|wget|python-requests|HeadlessChrome/)
    }
    END {
      for (k in uniq) { split(k, a, "|"); u[a[1]]++ }
      printf "%-12s %10s %10s %12s %10s\n", "day", "pageviews", "visitors", "model-pulls", "security"
      n = asorti(pv, days)
      for (i = 1; i <= n; i++) {
        d = days[i]
        printf "%-12s %10d %10d %12d %10d\n", d, pv[d], u[d], model[d], sec[d]
      }
      printf "\ntop external referrers:\n"
      for (r in refs) printf "  %6d  %s\n", refs[r], r
    }
  '"'"'
'
