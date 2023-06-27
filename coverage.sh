#!/usr/bin/env bash
deno test --ignore=npm --parallel --coverage=cov_profile
deno coverage --exclude='.*test.*\.ts$' cov_profile
rm -rf cov_profile
