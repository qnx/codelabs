#!/bin/sh
# Runs every step of the codelab on the target and prints the output.
cd /data/codelab
echo "== 1. the loop on its own"; ./ctl -s 3
echo "== 2. CPU storm below the loop (priority 59)"
./ctl -s 7 > /tmp/ctl3.txt & sleep 1
./spin 4 5 59; sleep 2; cat /tmp/ctl3.txt
echo "== 3. kill the loop under its watchdog"
./ctl > /tmp/ctl4.txt & sleep 1
./wd -l 100 > /tmp/wd4.txt & sleep 3
slay -f ctl; sleep 1; cat /tmp/ctl4.txt; cat /tmp/wd4.txt; slay -f wd
echo "== 4. CPU storm above the loop (priority 61)"
./ctl > /tmp/ctl5.txt & sleep 1
./wd -l 100 > /tmp/wd5.txt & sleep 2
./spin 4 3 61; sleep 2
slay -f ctl wd; cat /tmp/ctl5.txt; cat /tmp/wd5.txt
