#!/usr/bin/env bash
# Lions Den one-command build: check, test, bump version, push, wait for GitHub, report.
#   scripts/build.sh "short description of the changes"
# Optional: CLAUDE_SESSION=<session url> adds a Claude-Session trailer to the commit.
#           SKIP_TESTS=1 skips the multi-phone test (not recommended).
set -euo pipefail
REPO=The-Lions-den/the-lions-den.github.io
cd "$(dirname "$0")/.."
MSG="${1:?usage: scripts/build.sh \"what changed\"}"
T0=$(date +%s); echo "== build started $(date +%T)"

git pull -q --rebase --autostash

# 1. the app's script must parse
node -e "const h=require('fs').readFileSync('app/index.html','utf8');new Function(h.split('<script>')[1].split('</script>')[0]);" \
  && echo "app script: OK"
python3 -m py_compile scripts/feed.py && echo "feed.py: OK"

# 2. multi-phone test
if [ -z "${SKIP_TESTS:-}" ]; then
  [ -d tests/node_modules/jsdom ] || npm install --prefix tests --silent --no-audit --no-fund >/dev/null
  OUT=$(node tests/sync.js 2>&1 || true)
  echo "$OUT" | grep -v '^PASS' | tail -15
  echo "$OUT" | grep -q '^ALL PASS' || { echo "!! tests failed - nothing pushed"; exit 1; }
  echo "tests: $(echo "$OUT" | grep -c '^PASS') checks pass"
fi

# 3. bump the app version (sw.js cache name lions-den-vA-B -> vA-(B+1))
CUR=$(grep -o "lions-den-v[0-9]*-[0-9]*" app/sw.js | head -1)
MAJ=$(echo "$CUR" | sed 's/lions-den-v\([0-9]*\)-.*/\1/'); MIN=$(echo "$CUR" | sed 's/.*-\([0-9]*\)$/\1/')
NEW="lions-den-v$MAJ-$((MIN+1))"; VER="v$MAJ.$((MIN+1))"
sed -i "s/$CUR/$NEW/" app/sw.js; echo "version: $CUR -> $NEW"

# 4. commit and push
TRAIL="Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
[ -n "${CLAUDE_SESSION:-}" ] && TRAIL="$TRAIL
Claude-Session: $CLAUDE_SESSION"
git add -A
git commit -q -m "$VER: $MSG

$TRAIL"
git push -q origin main
SHA=$(git rev-parse HEAD); T1=$(date +%s)
echo "== pushed $VER ($SHA) at $(date +%T) - my part $((T1-T0))s"

# 5. wait for the GitHub run for this commit
RID=""
for i in $(seq 1 20); do
  RID=$(gh run list -R $REPO --commit "$SHA" --json databaseId -q '.[0].databaseId' 2>/dev/null || true)
  [ -n "$RID" ] && break; sleep 3
done
[ -n "$RID" ] || { echo "!! no GitHub run found"; exit 1; }
ST=""
for i in $(seq 1 60); do
  ST=$(gh run view "$RID" -R $REPO --json status,conclusion -q '.status+" "+.conclusion')
  [[ $ST == completed* ]] && break; sleep 10
done
T2=$(date +%s)
echo "== GitHub run $RID: $ST - GitHub part $((T2-T1))s, total $((T2-T0))s"
gh run view "$RID" -R $REPO --log 2>/dev/null \
  | grep -E "positions as of|cup draws read|feed.json written|could not read" | sed 's/^.*Z //' | cut -c1-220 | head -12 || true
[[ $ST == "completed success" ]] || { echo "!! GitHub run did not succeed - check: gh run view $RID -R $REPO --log-failed"; exit 1; }
echo "== $VER live at https://the-lions-den.github.io"
