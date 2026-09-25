// Command installer installs the packages needed to work on Delirio on a fresh
// Linux (or WSL2) machine: the system toolchain and the client npm packages.
// It does not build anything.
//
//	cd installer && go run .            # from the repo
//	cd installer && go run . -dry-run   # print what would run
package main

import (
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// requiredTools are the binaries the project needs on PATH.
var requiredTools = []string{"git", "gcc", "make", "node", "npm", "emcc", "go"}

// extraToolDirs are install locations some distros keep off the default PATH
// (Arch ships emcc in /usr/lib/emscripten and adds it only via /etc/profile.d).
var extraToolDirs = []string{"/usr/lib/emscripten"}

const minNodeMajor = 20 // required by Vite

var dryRun bool

func main() {
	skipSystem := flag.Bool("skip-system", false, "skip system package installation")
	flag.BoolVar(&dryRun, "dry-run", false, "print commands without running them")
	flag.Parse()

	if err := run(*skipSystem); err != nil {
		fmt.Fprintln(os.Stderr, "\n✗", err)
		os.Exit(1)
	}
	fmt.Println("\n✓ Packages installed. Next: ./src/build-web.sh && cd client && npm run dev")
}

func run(skipSystem bool) error {
	root, err := findRepoRoot()
	if err != nil {
		return err
	}
	fmt.Println("Repo:", root)

	addExtraToolDirsToPath()

	if !skipSystem {
		if err := installSystemPackages(); err != nil {
			return err
		}
	}
	warnOldNode()

	section("Client npm packages")
	if err := runCmd(filepath.Join(root, "client"), "npm", "install"); err != nil {
		return fmt.Errorf("npm install: %w", err)
	}
	return nil
}

// findRepoRoot walks up from the working directory until it finds the repo layout.
func findRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if fileExists(filepath.Join(dir, "src", "build-web.sh")) && fileExists(filepath.Join(dir, "client", "package.json")) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("run the installer from inside the Delirio repo")
		}
		dir = parent
	}
}

func installSystemPackages() error {
	section("System packages")

	missing := missingTools()
	if len(missing) == 0 {
		fmt.Println("All tools already installed:", strings.Join(requiredTools, ", "))
		return nil
	}
	fmt.Println("Missing:", strings.Join(missing, ", "))

	f, err := os.Open("/etc/os-release")
	if err != nil {
		return fmt.Errorf("cannot detect distro: %w", err)
	}
	defer f.Close()
	distro, err := detectDistro(parseOSRelease(f))
	if err != nil {
		return err
	}
	fmt.Println("Distro:", distro.Name)

	pkgs := packagesFor(distro, missing)
	if distro.Name == "Debian/Ubuntu" {
		if err := runCmd("", withSudo("apt-get", "update")...); err != nil {
			return err
		}
	}
	if err := runCmd("", withSudo(append(distro.Install, pkgs...)...)...); err != nil {
		return fmt.Errorf("installing %s: %w", strings.Join(pkgs, " "), err)
	}

	addExtraToolDirsToPath()
	if still := missingTools(); len(still) > 0 && !dryRun {
		return fmt.Errorf("still missing after install: %s", strings.Join(still, ", "))
	}
	return nil
}

func missingTools() []string {
	var missing []string
	for _, tool := range requiredTools {
		if _, err := exec.LookPath(tool); err != nil {
			missing = append(missing, tool)
		}
	}
	return missing
}

// packagesFor maps missing tools to unique package names, keeping order.
func packagesFor(d Distro, tools []string) []string {
	seen := map[string]bool{}
	var pkgs []string
	for _, tool := range tools {
		if p := d.Pkgs[tool]; !seen[p] {
			seen[p] = true
			pkgs = append(pkgs, p)
		}
	}
	return pkgs
}

func addExtraToolDirsToPath() {
	path := os.Getenv("PATH")
	for _, dir := range extraToolDirs {
		if fileExists(dir) && !strings.Contains(":"+path+":", ":"+dir+":") {
			path += ":" + dir
		}
	}
	os.Setenv("PATH", path)
}

func warnOldNode() {
	out, err := exec.Command("node", "--version").Output()
	if err != nil {
		return
	}
	major, err := strconv.Atoi(strings.SplitN(strings.TrimPrefix(strings.TrimSpace(string(out)), "v"), ".", 2)[0])
	if err == nil && major < minNodeMajor {
		fmt.Printf("⚠ Node %s is too old for Vite (need %d+). Install a newer one, e.g. via nvm or fnm.\n",
			strings.TrimSpace(string(out)), minNodeMajor)
	}
}

func withSudo(args ...string) []string {
	if os.Geteuid() == 0 {
		return args
	}
	return append([]string{"sudo"}, args...)
}

func runCmd(dir string, args ...string) error {
	fmt.Println("$", strings.Join(args, " "))
	if dryRun {
		return nil
	}
	cmd := exec.Command(args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	return cmd.Run()
}

func section(title string) {
	fmt.Printf("\n== %s ==\n", title)
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
