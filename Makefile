.PHONY: install uninstall status

install:
	@chmod +x install.sh && ./install.sh

uninstall:
	@chmod +x uninstall.sh && ./uninstall.sh

status:
	@chmod +x install.sh && ./install.sh status
