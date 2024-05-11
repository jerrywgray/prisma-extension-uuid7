# Prisma UUIDv7 Extension

A relatively simple prisma extension that will run uuidv7 generation on fields that are marked as UUID instead of either prisma running its own generation or having the db run the uuid generation. This plugin exists because uuidv7 is sortable--making better use of database pages-- and because the other option with postgres is either an extension in the db(like https://pgxn.org/dist/pg_uuidv7/ which RDS does not currently support) or a new custom function(ala https://gist.github.com/fabiolimace/515a0440e3e40efeb234e12644a6a346)

TODO: NPM and documentation