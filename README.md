## Instructions

1. Install prerequisite software:
    - nodejs
    - Either
        - Chrome for Testing
        - Chromium + Chromedriver
    - pnpm
    - unrar
    - unzip
2. Add a file called `.env` in the root of the project with the following details:
    ```
    # these two are required.
    EMAIL="<your email address for noiiz>"
    PASSWORD="<your password for noiiz>"

    # this one is not required, only using it because I'm on NixOS.
    CHROMIUM_EXECUTABLE_PATH="/path/to/executable"
    ```
3. run `pnpm install`.
4. run `pnpm run start`

This will now download all samples.