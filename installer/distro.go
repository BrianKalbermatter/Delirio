package main

import (
	"bufio"
	"fmt"
	"io"
	"strings"
)

// Distro describes how to install system packages on a Linux family.
type Distro struct {
	Name    string
	Install []string          // command prefix, e.g. pacman -S --needed
	Pkgs    map[string]string // tool binary -> package name
}

var distros = map[string]Distro{
	"arch": {
		Name:    "Arch",
		Install: []string{"pacman", "-S", "--needed", "--noconfirm"},
		Pkgs: map[string]string{
			"git": "git", "gcc": "gcc", "make": "make",
			"node": "nodejs", "npm": "npm", "emcc": "emscripten", "go": "go",
		},
	},
	"debian": {
		Name:    "Debian/Ubuntu",
		Install: []string{"apt-get", "install", "-y"},
		Pkgs: map[string]string{
			"git": "git", "gcc": "build-essential", "make": "build-essential",
			"node": "nodejs", "npm": "npm", "emcc": "emscripten", "go": "golang-go",
		},
	},
	"fedora": {
		Name:    "Fedora",
		Install: []string{"dnf", "install", "-y"},
		Pkgs: map[string]string{
			"git": "git", "gcc": "gcc", "make": "make",
			"node": "nodejs", "npm": "npm", "emcc": "emscripten", "go": "golang",
		},
	},
}

// parseOSRelease reads KEY=value pairs from /etc/os-release content.
func parseOSRelease(r io.Reader) map[string]string {
	fields := map[string]string{}
	sc := bufio.NewScanner(r)
	for sc.Scan() {
		key, val, ok := strings.Cut(strings.TrimSpace(sc.Text()), "=")
		if !ok || strings.HasPrefix(key, "#") {
			continue
		}
		fields[key] = strings.Trim(val, `"'`)
	}
	return fields
}

// detectDistro matches ID first, then each entry of ID_LIKE.
func detectDistro(osRelease map[string]string) (Distro, error) {
	candidates := append([]string{osRelease["ID"]}, strings.Fields(osRelease["ID_LIKE"])...)
	for _, id := range candidates {
		if id == "ubuntu" {
			id = "debian"
		}
		if d, ok := distros[id]; ok {
			return d, nil
		}
	}
	return Distro{}, fmt.Errorf("unsupported distro %q (supported: Arch, Debian/Ubuntu, Fedora)", osRelease["ID"])
}
