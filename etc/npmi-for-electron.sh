#!/usr/bin/env sh

# Electron's version.
E=$(electron --version)
export npm_config_target=${E#v}
# The architecture of Electron, can be ia32, x64, arm64.
#export npm_config_arch=arm64
#export npm_config_target_arch=arm64
# Download headers for Electron.
export npm_config_disturl=https://atom.io/download/electron
# Tell node-pre-gyp that we are building for Electron.
export npm_config_runtime=electron
# Tell node-pre-gyp to build module from source code.
export npm_config_build_from_source=true
# Reinstall native module(s); store cache to ~/.electron-gyp.
rm -rf node_modules/node-pty
HOME=~/.electron-gyp npm install node-pty
