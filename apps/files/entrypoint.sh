#!/bin/sh

./node_modules/.bin/mikro-orm migration:up

exec node ./dist/apps/files/main.js
