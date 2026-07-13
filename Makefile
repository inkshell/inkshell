# VibeBox — common developer tasks.
# Thin wrappers over the npm scripts so `make <thing>` just works.

.DEFAULT_GOAL := help
.PHONY: help install dev run build typecheck lint fmt fmt-check check \
        pack pack-mac pack-win pack-linux clean clean-all

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (rebuilds native node-pty for Electron)
	npm install

dev: ## Run the app in development with hot reload
	npm run dev

run: dev ## Alias for `dev`

build: ## Type-check and build all three processes
	npm run build

typecheck: ## Type-check main/preload and renderer
	npm run typecheck

lint: ## Lint the codebase with ESLint
	npm run lint

fmt: ## Format sources with Prettier
	npm run format

fmt-check: ## Check formatting without writing
	npm run format:check

check: typecheck lint fmt-check ## Run every CI check (typecheck + lint + format)

pack-mac: ## Build a macOS distributable (.dmg + .zip)
	npm run pack:mac

pack-win: ## Build a Windows installer (NSIS)
	npm run pack:win

pack-linux: ## Build a Linux distributable (AppImage + .deb)
	npm run pack:linux

pack: pack-mac ## Alias for the current platform's package (defaults to macOS)

clean: ## Remove build output
	rm -rf out dist release

clean-all: clean ## Remove build output and installed dependencies
	rm -rf node_modules
