#!/usr/bin/env bash
# Préparation du PC serveur Linux Mint (hébergement de développement, deploy/MINT.md).
# À lancer une seule fois, en administrateur :
#   sudo bash deploy/bootstrap-mint.sh ["ssh-ed25519 AAAA… commentaire"]
# L'argument facultatif est une clé publique SSH autorisée à se connecter au compte courant.
# Le script peut être relancé sans risque.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Lancer avec sudo : sudo bash $0" >&2
  exit 1
fi
OWNER=${SUDO_USER:-root}
HOME_DIR=$(getent passwd "$OWNER" | cut -d: -f6)

echo "== Paquets de base"
apt-get update
apt-get install -y ca-certificates curl git openssh-server ufw

if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
  echo "== Docker déjà installé : conservé tel quel"
else
echo "== Docker Engine (dépôt officiel, base Ubuntu de Mint)"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
CODENAME=$(. /etc/os-release && echo "${UBUNTU_CODENAME}")
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${CODENAME} stable" \
  >/etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
usermod -aG docker "$OWNER"

echo "== Tailscale"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
systemctl enable --now tailscaled

echo "== Jamais de mise en veille (serveur)"
systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

echo "== Pare-feu : rien d'entrant, sauf SSH depuis le réseau local et le réseau Tailscale"
echo "   (les règles existantes sont conservées)"
ufw default deny incoming
ufw default allow outgoing
ufw allow from 192.168.0.0/16 to any port 22 proto tcp
ufw allow in on tailscale0
ufw --force enable

echo "== SSH : connexion root interdite"
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl enable --now ssh
systemctl reload ssh

if [[ -n "${1:-}" ]]; then
  echo "== Clé SSH autorisée pour ${OWNER}"
  install -d -m 700 -o "$OWNER" -g "$OWNER" "$HOME_DIR/.ssh"
  touch "$HOME_DIR/.ssh/authorized_keys"
  grep -qxF "$1" "$HOME_DIR/.ssh/authorized_keys" || echo "$1" >>"$HOME_DIR/.ssh/authorized_keys"
  chown "$OWNER:$OWNER" "$HOME_DIR/.ssh/authorized_keys"
  chmod 600 "$HOME_DIR/.ssh/authorized_keys"
fi

echo
echo "Terminé. Étapes suivantes (deploy/MINT.md) :"
echo "  1. se déconnecter puis se reconnecter (groupe docker) ;"
echo "  2. sudo tailscale up --hostname=biomia   (ouvrir le lien affiché) ;"
echo "  3. sudo tailscale funnel --bg 8080            (accepter l'activation de Funnel)."
