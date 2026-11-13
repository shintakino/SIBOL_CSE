FROM cloudflare/cloudflared:2026.10.3
COPY deploy/cloudflared.yml /etc/cloudflared/config.yml
