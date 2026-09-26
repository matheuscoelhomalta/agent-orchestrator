.PHONY: test install-local
test:
	npm run check
	npm test

install-local:
	python3 scripts/install-local.py
