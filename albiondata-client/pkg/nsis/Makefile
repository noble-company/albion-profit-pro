TOP_SRCDIR = ../..
PACKAGE = albiondata-client
# PATCH LOCAL (Albion Profit Pro): product-owned installer identity.
PACKAGE_NAME = Albion Profit Pro Client
PACKAGE_BUGREPORT = https://github.com/noble-company/albion-profit-pro/issues
INSTALLER_COMPRESSION = lzma
PACKAGE_EXE = albiondata-client.exe

all: nsis

nsis:
	set -e; if [ "x${VERSION}" = "x" ]; then export VERSION="0.0.0-dev"; fi; \
	makensis -DPACKAGE_VERSION="$$VERSION" -DPACKAGE="$(PACKAGE)" -DPACKAGE_NAME="$(PACKAGE_NAME)" -DPACKAGE_EXE="$(PACKAGE_EXE)" -DPACKAGE_BUGREPORT="$(PACKAGE_BUGREPORT)" -DTOP_SRCDIR="$(TOP_SRCDIR)" -DOUTFILE=../../albiondata-client-amd64-installer.exe -X"SetCompressor /FINAL /SOLID $(INSTALLER_COMPRESSION)" albiondata-client.nsi $<
