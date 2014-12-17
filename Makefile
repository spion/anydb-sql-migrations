lib/index.js: src/*.ts
	tsc src/references.d.ts src/index.ts  --sourceMap --noImplicitAny --nolib -d -m commonjs --outDir lib
	./node_modules/.bin/tsc-wrap-definition anydb-sql-migrations < lib/index.d.ts > d.ts/anydb-sql-migrations.d.ts
	rm lib/*.d.ts

clean:
	rm lib/*
