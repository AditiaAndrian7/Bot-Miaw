#!/bin/bash
set -e

# Update repo dan install python + ffmpeg
apt-get update
apt-get install -y python3 python3-pip ffmpeg libatomic1

# Buat python3 sebagai default
ln -sf /usr/bin/python3 /usr/bin/python
