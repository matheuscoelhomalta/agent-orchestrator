.PHONY: test install-local
test:
	npm run check
	npm test
	python3 -m unittest discover -s scripts/tests

install-local:
	python3 scripts/install-local.py
