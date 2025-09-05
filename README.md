# NixOS VPS Configuration Documentation

## Table of Contents

1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Boot Configuration](#boot-configuration)
4. [Network Configuration](#network-configuration)
5. [System Services](#system-services)
6. [Package Management](#package-management)
7. [User Management](#user-management)
8. [Security Configuration](#security-configuration)
9. [Virtualization](#virtualization)
10. [System Maintenance](#system-maintenance)
11. [Installation Guide](#installation-guide)
12. [Configuration Management](#configuration-management)
13. [Troubleshooting](#troubleshooting)
14. [Advanced Configuration](#advanced-configuration)

---

## Introduction

This NixOS configuration is designed for a Virtual Private Server (VPS) environment, providing a secure, minimal, and maintainable server setup. The configuration follows NixOS declarative principles, ensuring reproducible deployments and system state management.

### Key Features

- **Declarative Configuration**: Everything is defined in code, making it version-controllable and reproducible
- **Security-First Approach**: Hardened SSH, firewall rules, and minimal attack surface
- **Container Ready**: Docker integration for modern application deployment
- **Automated Maintenance**: Built-in garbage collection and system optimization
- **Remote Management**: SSH-based administration with security hardening

### Target Use Cases

- Web application hosting
- Development environments
- Container orchestration
- Remote development servers
- Microservice deployments

---

## System Architecture

### Hardware Requirements

- **Minimum RAM**: 1GB (2GB recommended)
- **Storage**: 10GB minimum (20GB recommended)
- **Architecture**: x86_64 (AMD64)
- **Boot**: UEFI capable system

### System Specifications

```nix
system.stateVersion = "23.11";
time.timeZone = "India/Kolkata";
i18n.defaultLocale = "en_US.UTF-8";
networking.hostName = "nix-vps";
```

The configuration targets NixOS 23.11 and sets the system for Indian Standard Time with US English localization. The hostname is configured as `nix-vps` for easy identification in multi-server environments.

---

## Boot Configuration

### SystemD-Boot Loader

The system uses systemd-boot as the bootloader, which is the modern replacement for GRUB on UEFI systems.

```nix
boot.loader.systemd-boot.enable = true;
boot.loader.efi.canTouchEfiVariables = true;
```

#### Why SystemD-Boot?

- **Faster Boot Times**: Minimal overhead compared to GRUB
- **UEFI Native**: Direct integration with UEFI firmware
- **Automatic Updates**: Seamlessly handles kernel updates
- **Simple Configuration**: Less complexity than GRUB

#### EFI Variables

The `canTouchEfiVariables` setting allows NixOS to modify EFI boot variables, enabling:

- Automatic boot entry creation
- Boot order management
- Recovery options setup

---

## Network Configuration

### Network Manager Integration

NetworkManager provides dynamic network configuration with automatic connection management.

```nix
networking.networkmanager.enable = true;
```

NetworkManager handles:

- **DHCP Configuration**: Automatic IP address assignment
- **DNS Resolution**: Automatic DNS server configuration
- **Connection Profiles**: Saved network configurations
- **Interface Management**: Automatic interface bring-up/down

### Static IP Configuration (Optional)

For production environments requiring static IP addresses:

```nix
networking.interfaces.eth0.ipv4.addresses = [{
  address = "192.168.1.100";
  prefixLength = 24;
}];
networking.defaultGateway = "192.168.1.1";
networking.nameservers = [ "8.8.8.8" "1.1.1.1" ];
```

This configuration provides:

- **Fixed IP Address**: Consistent network identity
- **Custom Gateway**: Direct routing control
- **Reliable DNS**: Google and Cloudflare DNS servers

### Firewall Configuration

The firewall provides network security with a default-deny policy:

```nix
networking.firewall = {
  enable = true;
  allowedTCPPorts = [ 22 ];
  allowedUDPPorts = [ ];
  trustedInterfaces = [ "lo" ];
  allowPing = true;
};
```

#### Firewall Rules Explained

- **Default Policy**: Deny all incoming connections
- **SSH Access**: Port 22 allowed for remote administration
- **Loopback Trust**: Local interface fully trusted
- **ICMP Ping**: Network diagnostics enabled
- **UDP Ports**: None open by default (secure posture)

---

## System Services

### SSH Service (OpenSSH)

SSH provides secure remote access with hardened configuration:

```nix
services.openssh = {
  enable = true;
  ports = [ 22 ];
  settings = {
    PasswordAuthentication = true;
    PermitRootLogin = "no";
    X11Forwarding = false;
    MaxAuthTries = 3;
  };
};
```

#### Security Features

- **Root Login Disabled**: Prevents direct root access
- **Limited Auth Attempts**: Reduces brute force effectiveness
- **No X11 Forwarding**: Eliminates GUI-based attack vectors
- **Standard Port**: Uses default SSH port (consider changing for production)

#### Authentication Methods

Currently configured for password authentication. For enhanced security, consider:

- **SSH Key Authentication**: More secure than passwords
- **Two-Factor Authentication**: Additional security layer
- **Certificate-Based Auth**: Enterprise-grade authentication

### Cron Service

Automated task scheduling using the traditional cron daemon:

```nix
services.cron = {
  enable = true;
  systemCronJobs = [
    # Example: "0 2 * * * root /run/current-system/sw/bin/echo 'Daily backup' >> /var/log/cron.log"
  ];
};
```

#### Cron vs SystemD Timers

While NixOS supports systemd timers, cron is included for:

- **Familiarity**: Standard Unix scheduling interface
- **Legacy Compatibility**: Existing cron job migration
- **Simple Syntax**: Easy-to-understand scheduling format

---

## Package Management

### System-Wide Packages

The configuration includes essential packages for server operations:

```nix
environment.systemPackages = with pkgs; [
  # Core utilities
  vim tmux git bash

  # Docker tools
  docker docker-compose

  # Network tools
  wget curl openssh

  # System monitoring
  htop tree

  # Text processing
  grep sed awk
];
```

#### Package Categories

**Core Utilities**

- **vim**: Text editor for configuration files
- **tmux**: Terminal multiplexer for persistent sessions
- **git**: Version control for configuration management
- **bash**: Primary shell environment

**Container Tools**

- **docker**: Container runtime
- **docker-compose**: Multi-container orchestration

**Network Utilities**

- **wget/curl**: HTTP client tools
- **openssh**: SSH client for connecting to other systems

**System Tools**

- **htop**: Enhanced process monitor
- **tree**: Directory structure visualization
- **grep/sed/awk**: Text processing utilities

### Package Installation Methods

**Imperative Installation** (temporary):

```bash
nix-shell -p package-name
```

**Declarative Installation** (permanent):
Add to `environment.systemPackages` and rebuild system.

---

## User Management

### Admin User Configuration

```nix
users.users.admin = {
  isNormalUser = true;
  description = "Admin User";
  extraGroups = [ "networkmanager" "wheel" "docker" ];
  packages = with pkgs; [
    # User-specific packages
  ];
};
```

#### User Properties

- **Normal User**: Standard user account (not system user)
- **Description**: Human-readable account description
- **Group Membership**: Defines user capabilities

#### Group Permissions

- **networkmanager**: Network configuration access
- **wheel**: Sudo privileges
- **docker**: Container management rights

### Sudo Configuration

```nix
security.sudo.wheelNeedsPassword = true;
```

This setting requires password authentication for sudo commands, balancing security with usability.

---

## Security Configuration

### Access Control

The configuration implements defense-in-depth security:

1. **Firewall**: Network-level filtering
2. **SSH Hardening**: Secure remote access
3. **User Restrictions**: Principle of least privilege
4. **Service Minimization**: Reduced attack surface

### Security Recommendations

**SSH Key Setup**:

```bash
# Generate key pair
ssh-keygen -t ed25519 -C "your-email@example.com"

# Add public key to server
ssh-copy-id admin@your-server
```

**Firewall Hardening**:

```nix
networking.firewall = {
  enable = true;
  allowedTCPPorts = [ 22 80 443 ];  # Add only required ports
  logReversePathDrops = true;       # Log suspicious packets
  logRefusedConnections = false;    # Reduce log noise
};
```

### Password Security

For production systems:

```nix
users.users.admin = {
  hashedPassword = "$6$...";  # Generate with: mkpasswd -m sha-512
};
```

Use strong, unique passwords and consider password managers.

---

## Virtualization

### Docker Configuration

```nix
virtualisation.docker = {
  enable = true;
  enableOnBoot = true;
};
```

#### Docker Features

- **System Service**: Docker daemon runs at boot
- **User Access**: Admin user can manage containers
- **Network Integration**: Docker networks work with system firewall

#### Rootless Docker (Optional)

For enhanced security:

```nix
virtualisation.docker.rootless = {
  enable = true;
  setSocketVariable = true;
};
```

Benefits:

- **Reduced Privileges**: Containers run as user, not root
- **Security Isolation**: Better container/host separation
- **Compliance**: Meets security requirements for restricted environments

---

## System Maintenance

### Automatic Garbage Collection

```nix
nix.gc = {
  automatic = true;
  dates = "weekly";
  options = "--delete-older-than 30d";
};
```

This configuration:

- **Runs Weekly**: Every Sunday by default
- **30-Day Retention**: Keeps packages for one month
- **Automatic Cleanup**: No manual intervention required

### Store Optimization

```nix
nix.settings.auto-optimise-store = true;
```

Store optimization:

- **Deduplication**: Removes duplicate files
- **Hard Links**: Saves disk space
- **Automatic**: Runs during garbage collection

### Flakes Support

```nix
nix.settings.experimental-features = [ "nix-command" "flakes" ];
```

Flakes provide:

- **Reproducible Builds**: Lock file ensures consistency
- **Dependency Management**: Better package version control
- **Modern CLI**: Enhanced nix command interface

---

## Installation Guide

### Prerequisites

1. **NixOS Installation Media**: Download from nixos.org
2. **Hardware Detection**: Boot from installation media
3. **Network Access**: Internet connection required
4. **Storage Preparation**: Partition disks appropriately

### Installation Steps

#### Step 1: Hardware Configuration

```bash
nixos-generate-config --root /mnt
```

This generates `hardware-configuration.nix` with:

- Detected hardware modules
- Filesystem configurations
- Boot device settings

#### Step 2: Configuration Deployment

```bash
# Copy your configuration
cp configuration.nix /mnt/etc/nixos/

# Install system
nixos-install

# Set root password when prompted
```

#### Step 3: First Boot

```bash
# Reboot into new system
reboot

# Set admin user password
passwd admin

# Verify services
systemctl status sshd
systemctl status docker
```

### Post-Installation Verification

**Network Connectivity**:

```bash
ping google.com
ip addr show
```

**Service Status**:

```bash
systemctl status sshd
systemctl status docker
systemctl status NetworkManager
```

**Firewall Rules**:

```bash
iptables -L -n
```

---

## Configuration Management

### Version Control

Store your configuration in Git:

```bash
cd /etc/nixos
git init
git add .
git commit -m "Initial NixOS configuration"
```

### Configuration Updates

#### Testing Changes

```bash
# Test configuration without making permanent
nixos-rebuild test

# Make permanent if tests pass
nixos-rebuild switch
```

#### System Upgrades

```bash
# Update channel
nix-channel --update

# Upgrade system
nixos-rebuild switch --upgrade
```

### Rollback Capabilities

NixOS provides atomic rollbacks:

```bash
# List generations
nixos-rebuild list-generations

# Rollback to previous generation
nixos-rebuild switch --rollback

# Rollback to specific generation
nixos-rebuild switch --switch-generation 42
```

---

## Troubleshooting

### Common Issues

#### SSH Connection Problems

**Symptoms**: Cannot connect via SSH

**Diagnosis**:

```bash
# Check service status
systemctl status sshd

# Check firewall
iptables -L -n | grep :22

# Check logs
journalctl -u sshd -f
```

**Solutions**:

1. Verify firewall allows port 22
2. Check SSH service is running
3. Verify user exists and has correct groups

#### Docker Issues

**Symptoms**: Docker commands fail

**Diagnosis**:

```bash
# Check Docker service
systemctl status docker

# Check user groups
groups admin

# Test Docker
docker run hello-world
```

**Solutions**:

1. Ensure user is in docker group
2. Restart Docker service if needed
3. Check virtualization is enabled

#### Network Connectivity

**Symptoms**: No internet access

**Diagnosis**:

```bash
# Check interfaces
ip addr show

# Check routing
ip route show

# Check DNS
nslookup google.com
```

**Solutions**:

1. Restart NetworkManager
2. Check physical connections
3. Verify DNS configuration

### Log Analysis

**System Logs**:

```bash
journalctl -xe                    # Recent system events
journalctl -u servicename         # Specific service logs
journalctl --since "1 hour ago"   # Time-filtered logs
```

**Service-Specific Logs**:

```bash
journalctl -u sshd               # SSH logs
journalctl -u docker             # Docker logs
journalctl -u NetworkManager     # Network logs
```

---

## Advanced Configuration

### Custom Services

Create systemd services:

```nix
systemd.services.my-app = {
  description = "My Application";
  after = [ "network.target" ];
  wantedBy = [ "multi-user.target" ];
  serviceConfig = {
    Type = "simple";
    User = "admin";
    ExecStart = "/path/to/my-app";
    Restart = "always";
  };
};
```

### Environment Variables

System-wide environment variables:

```nix
environment.variables = {
  EDITOR = "vim";
  BROWSER = "firefox";
};
```

### Kernel Modules

Load specific kernel modules:

```nix
boot.kernelModules = [ "kvm-intel" "vhost-net" ];
```

### File System Management

Additional mount points:

```nix
fileSystems."/data" = {
  device = "/dev/disk/by-label/data";
  fsType = "ext4";
  options = [ "defaults" "noatime" ];
};
```

### Performance Tuning

Kernel parameters:

```nix
boot.kernel.sysctl = {
  "net.core.rmem_max" = 16777216;
  "net.core.wmem_max" = 16777216;
  "vm.swappiness" = 10;
};
```

This comprehensive documentation provides complete guidance for understanding, deploying, and maintaining the NixOS VPS configuration. Each section builds upon previous concepts while providing practical examples and troubleshooting guidance.
