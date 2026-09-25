package main

import (
	"strings"
	"testing"
)

func TestDetectDistro(t *testing.T) {
	tests := []struct {
		name      string
		osRelease string
		want      string
		wantErr   bool
	}{
		{"arch", "NAME=\"Arch Linux\"\nID=arch\n", "Arch", false},
		{"manjaro via ID_LIKE", "ID=manjaro\nID_LIKE=arch\n", "Arch", false},
		{"ubuntu", "ID=ubuntu\nID_LIKE=debian\n", "Debian/Ubuntu", false},
		{"pop via ID_LIKE list", "ID=pop\nID_LIKE=\"ubuntu debian\"\n", "Debian/Ubuntu", false},
		{"fedora", "ID=fedora\n", "Fedora", false},
		{"unsupported", "ID=alpine\n", "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d, err := detectDistro(parseOSRelease(strings.NewReader(tt.osRelease)))
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if d.Name != tt.want {
				t.Errorf("distro = %q, want %q", d.Name, tt.want)
			}
		})
	}
}

func TestEveryDistroCoversEveryTool(t *testing.T) {
	for id, d := range distros {
		for _, tool := range requiredTools {
			if d.Pkgs[tool] == "" {
				t.Errorf("%s: no package for %q", id, tool)
			}
		}
	}
}
