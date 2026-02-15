#!/bin/bash
set -e

echo "=== RUNNING PREINSTALL ==="

apt-get update
apt-get install -y python3 python3-pip ffmpeg libatomic1

ln -sf /usr/bin/python3 /usr/bin/python

echo "=== PYTHON INSTALLED ==="
python --version
