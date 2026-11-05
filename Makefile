.PHONY: help up down logs restart ps backup backup-status test-backup restore dev test check

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

up: .env ## Build and start Tack in the background
	mkdir -p data backups $${RCLONE_CONFIG_DIR:-$$HOME/.config/rclone}
	docker compose up -d --build

down: ## Stop Tack
	docker compose down

logs: ## Follow logs
	docker compose logs -f

restart: ## Restart containers
	docker compose restart

ps: ## Show container status and health
	docker compose ps

backup: ## Run a backup now
	docker compose exec backup backup.sh

backup-status: ## Show the result of the last backup
	@cat backups/status.json

test-backup: ## Self-test backup, prune and restore on a throwaway database
	docker compose run --rm --no-deps backup test.sh

restore: ## Restore a backup: make restore FILE=backups/tack-<stamp>.db.gz
	@test -n "$(FILE)" || { echo "Usage: make restore FILE=backups/tack-<stamp>.db.gz"; exit 1; }
	@test -f "$(FILE)" || { echo "$(FILE) not found"; exit 1; }
	docker compose stop app
	docker compose run --rm --no-deps -v "$(abspath $(FILE)):/restore/$(notdir $(FILE)):ro" backup \
	  restore.sh "/restore/$(notdir $(FILE))"; status=$$?; docker compose start app; exit $$status

dev: ## Run server + web dev servers locally (no Docker)
	npm run dev

test: ## Run the test suite
	npm test

check: ## Types, lint, format, tests
	npm run check

.env:
	cp .env.example .env
	@echo "Created .env. Add the VAPID keys (npm run vapid)."
