nohup bash -lc '
set -euo pipefail
bash /mnt/20t/xubuqiang/EcoClaw/run_claw_eval_isolated_t_general.sh
iso_pid="$(cat /mnt/20t/xubuqiang/EcoClaw/claw_eval_isolated_t_general.pid)"
while ps -p "$iso_pid" > /dev/null 2>&1; do
sleep 30
done

bash /mnt/20t/xubuqiang/EcoClaw/run_claw_eval_continuous_t_by_category.sh
cont_pid="$(cat /mnt/20t/xubuqiang/EcoClaw/claw_eval_continuous_t_by_category.pid)"
while ps -p "$cont_pid" > /dev/null 2>&1; do
sleep 30
done
' > /mnt/20t/xubuqiang/EcoClaw/claw_eval_t_serial_sequence.log 2>&1 &
echo $! > /mnt/20t/xubuqiang/EcoClaw/claw_eval_t_serial_sequence.pid