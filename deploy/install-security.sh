#!/usr/bin/env bash
set -euo pipefail

install -d -m 0700 /var/backups/yingji
chmod 0700 /var/lib/yingji /var/lib/yingji/state
chown -R yingji:yingji /var/lib/yingji
chown -R root:root /opt/yingji/current/
find -L /opt/yingji/current -path '/opt/yingji/current/node_modules' -prune -o -type d -exec chmod 0755 {} +
find -L /opt/yingji/current -path '/opt/yingji/current/node_modules' -prune -o -type f -exec chmod 0644 {} +
chmod 0755 /opt/yingji/current/deploy/*.sh
install -d -o yingji -g yingji -m 0700 /opt/yingji/current/dist/server/.wrangler
chown -R yingji:yingji /opt/yingji/current/dist/server/.wrangler
find /opt/yingji/current/dist/server/.wrangler -type d -exec chmod 0700 {} +
find /opt/yingji/current/dist/server/.wrangler -type f -exec chmod 0600 {} +
chown root:www-data /etc/nginx/yingji.htpasswd
chmod 0640 /etc/nginx/yingji.htpasswd

REAL_IP_TMP="$(mktemp)"
trap 'rm -f "$REAL_IP_TMP"' EXIT
{
  echo 'real_ip_header CF-Connecting-IP;'
  echo 'real_ip_recursive on;'
  curl --fail --silent --show-error https://www.cloudflare.com/ips-v4 \
    | while IFS= read -r network; do printf 'set_real_ip_from %s;\n' "$network"; done
  curl --fail --silent --show-error https://www.cloudflare.com/ips-v6 \
    | while IFS= read -r network; do printf 'set_real_ip_from %s;\n' "$network"; done
} > "$REAL_IP_TMP"

install -m 0644 "$REAL_IP_TMP" /etc/nginx/conf.d/cloudflare-realip.conf
install -m 0644 /opt/yingji/current/deploy/nginx-yingji-security.conf /etc/nginx/conf.d/yingji-security.conf
install -m 0644 /opt/yingji/current/deploy/nginx-yingji.conf /etc/nginx/sites-available/yingji

chmod 0755 /opt/yingji/current/deploy/backup-yingji.sh
install -m 0644 /opt/yingji/current/deploy/yingji-backup.service /etc/systemd/system/yingji-backup.service
install -m 0644 /opt/yingji/current/deploy/yingji-backup.timer /etc/systemd/system/yingji-backup.timer

nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl enable --now yingji-backup.timer
systemctl start yingji-backup.service
