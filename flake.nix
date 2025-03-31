{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs = inputs:
    inputs.flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import inputs.nixpkgs {inherit system;};
      browsers' = pkgs.playwright-driver.browsers;
      nativeBuildInputs = with pkgs; [
        browsers'
        direnv
        nodejs
        pnpm
      ];
    in {
      devShells.default = pkgs.mkShell {
        inherit nativeBuildInputs;
        buildInputs = nativeBuildInputs;
        shellHook = ''
          export PLAYWRIGHT_BROWSERS_PATH=${browsers'}
          export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
        '';
      };
    });
}
