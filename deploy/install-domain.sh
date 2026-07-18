#!/usr/bin/env bash
set -euo pipefail

install -d /var/www/certbot
install -m 0644 /tmp/nginx-yingji-http.conf /etc/nginx/sites-available/yingji
ln -sfn /etc/nginx/sites-available/yingji /etc/nginx/sites-enabled/yingji
nginx -t
systemctl reload nginx

certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d yingji.kivelo0017.xyz \
  --non-interactive \
  --agree-tos \
  --register-unsafely-without-email \
  --keep-until-expiring

if [[ ! -f /etc/nginx/yingji.htpasswd ]]; then
  umask 077
  AUTH_PASS="$(openssl rand -hex 10)"
  AUTH_HASH="$(openssl passwd -6 "$AUTH_PASS")"
  printf 'admin:%s\n' "$AUTH_HASH" > /etc/nginx/yingji.htpasswd
  printf '盈迹登录地址：https://yingji.kivelo0017.xyz\n用户名：admin\n密码：%s\n' "$AUTH_PASS" > /root/yingji-login.txt
fi

if ! id -u yingji-auth >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/yingji-auth --shell /usr/sbin/nologin yingji-auth
fi
install -d -o yingji-auth -g www-data -m 0750 /var/lib/yingji-auth
if [[ ! -f /var/lib/yingji-auth/credentials.htpasswd ]]; then
  install -o yingji-auth -g www-data -m 0640 \
    /etc/nginx/yingji.htpasswd /var/lib/yingji-auth/credentials.htpasswd
fi

install -m 0644 /opt/yingji/current/deploy/nginx-yingji.conf /etc/nginx/sites-available/yingji
nginx -t
systemctl reload nginx
systemctl is-active nginx
