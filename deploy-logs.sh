#!/bin/bash

echo -e "\033[0;34m📋 Viewing live logs...\033[0m"
ssh root@167.172.142.200 "pm2 logs skilledproz-api"