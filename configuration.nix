{ config, pkgs, ... }:

{
  imports = [
    # Include the results of the hardware scan
    ./hardware-configuration.nix
  ];

  # Bootloader
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Networking
  networking = {
    hostName = "nix-vps";
    
    # Enable networking
    networkmanager.enable = true;
    
    # Local network configuration
    interfaces = {
      # Configure your network interface (adjust interface name as needed)
      # eth0.ipv4.addresses = [{
      #   address = "192.168.1.100";
      #   prefixLength = 24;
      # }];
    };
    
    # Default gateway (uncomment and adjust if using static IP)
    # defaultGateway = "192.168.1.1";
    # nameservers = [ "8.8.8.8" "1.1.1.1" ];
    
    # Firewall configuration
    firewall = {
      enable = true;
      allowedTCPPorts = [ 22 ]; # SSH
      allowedUDPPorts = [ ];
      # Allow specific interfaces for local network
      trustedInterfaces = [ "lo" ];
      # Allow ping
      allowPing = true;
    };
  };

  # Time zone
  time.timeZone = "India/Kolkata";

  # Internationalization
  i18n.defaultLocale = "en_US.UTF-8";

  # OpenSSH configuration
  services.openssh = {
    enable = true;
    ports = [ 22 ];
    settings = {
      PasswordAuthentication = true; # Set to false for key-only auth
      PermitRootLogin = "no";
      X11Forwarding = false;
      MaxAuthTries = 3;
    };
    # Uncomment to add your SSH key
    # authorizedKeysFiles = [ "/home/your-username/.ssh/authorized_keys" ];
  };

  # Cron service
  services.cron = {
    enable = true;
    systemCronJobs = [
      # Example cron job - runs every day at 2 AM
      # "0 2 * * * root /run/current-system/sw/bin/echo 'Daily backup' >> /var/log/cron.log"
    ];
  };

  # Docker configuration
  virtualisation.docker = {
    enable = true;
    enableOnBoot = true;
    # Add users to docker group
    # rootless = {
    #   enable = true;
    #   setSocketVariable = true;
    # };
  };

  # System packages
  environment.systemPackages = with pkgs; [
    # Core utilities
    vim
    tmux
    git
    bash
    
    # Docker tools
    docker
    docker-compose
    
    # Network tools
    wget
    curl
    openssh
    
    # System monitoring
    htop
    tree
    
    # Text processing
    grep
    sed
    awk
  ];

  # User accounts
  users.users.admin = {
    isNormalUser = true;
    description = "Admin User";
    extraGroups = [ "networkmanager" "wheel" "docker" ];
    # Uncomment to set initial password
    # hashedPassword = ""; # Generate with: mkpasswd -m sha-512
    packages = with pkgs; [
      # User-specific packages can go here
    ];
  };

  # Enable sudo for wheel group
  security.sudo.wheelNeedsPassword = true;

  # System state version
  system.stateVersion = "23.11"; # Don't change this after initial install

  # Additional system configuration
  
  # Enable automatic garbage collection
  nix.gc = {
    automatic = true;
    dates = "weekly";
    options = "--delete-older-than 30d";
  };

  # Optimize nix store
  nix.settings.auto-optimise-store = true;

  # Enable flakes (optional but recommended)
  nix.settings.experimental-features = [ "nix-command" "flakes" ];
}