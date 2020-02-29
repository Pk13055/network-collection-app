#!/bin/sh
# determine development/production

if [ -z "$DEBUG" ]; then
    echo "Need to set \$DEBUG"
    exit 1
fi  

if [ "$DEBUG" = true ] ; then
    npm run-script watch
else
    npm run-script serve
fi
