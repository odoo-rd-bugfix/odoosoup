extension.zip:	e.js manifest.json i.png
	7z -mx=9 a $@ $^

clean:
	rm -f extension.zip
