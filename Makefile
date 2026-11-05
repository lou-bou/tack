.PHONY: help up down logs build restart ps dev test check

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

up: .env ## Build and start Tack in the background
	mkdir -p data backups
	docker compose up -d --build

down: ## Stop Tack
	docker compose down

logs: ## Follow logs
	docker compose logs -f

restart: ## Restart containers
	docker compose restart

ps: ## Show container status and health
	docker compose ps

dev: ## Run server + web dev servers locally (no Docker)
	npm run dev

test: ## Run the test suite
	npm test

check: ## Types, lint, format, tests
	npm run check

.env:
	cp .env.example .env
	@echo "Created .env. Add the VAPID keys (npm run vapid)."
