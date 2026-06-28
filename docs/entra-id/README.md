# Azure AD (Entra ID) Plugin Documentation

This directory contains comprehensive documentation for the Azure AD (Entra ID) plugin for Docmost.

## 📚 Documentation Files

### [SETUP.md](./SETUP.md)
**Admin Setup Guide** - Step-by-step instructions for configuring Azure AD integration in Docmost, including:
- Azure Portal app registration
- Finding credentials (Tenant ID, Client ID, Client Secret)
- Configuring redirect URI
- Setting up Graph API permissions
- Configuring in Docmost Security page

### [API.md](./API.md)
**API Reference** - Complete API documentation including:
- Plugin configuration endpoints
- Test connection endpoint
- Request/response schemas
- Error handling
- Authentication requirements

### [ARCHITECTURE.md](./ARCHITECTURE.md)
**Technical Architecture** - In-depth technical design including:
- Plugin system integration
- Hook-based architecture
- OIDC flow with Azure AD
- Group sync workflow
- Database schema
- Service layer design

### [CONFIGURATION.md](./CONFIGURATION.md)
**Configuration Options** - Detailed configuration reference including:
- Required vs optional fields
- JSON schema specifications
- Default values
- Validation rules
- Advanced options (group mapping, email domain validation)

### [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
**Troubleshooting Guide** - Common issues and solutions including:
- Token validation errors
- Configuration issues
- Group sync failures
- Connection problems
- Logging and debugging tips

### [SECURITY.md](./SECURITY.md)
**Security Considerations** - Security best practices including:
- Token validation security
- Secrets management
- Tenant isolation
- Rate limiting
- HTTPS requirements
- Audit logging

## 🎯 Quick Start

1. **Admin**: Follow [SETUP.md](./SETUP.md) to register app in Azure Portal and configure Docmost
2. **Developer**: Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the technical design
3. **Troubleshooting**: Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues

## 📋 Overview

The Azure AD plugin enables Docmost to authenticate users and sync group memberships using Microsoft Azure AD (now called Entra ID). 

**Key Features:**
- OIDC-based authentication
- Automatic group membership sync from Azure AD
- Group-to-workspace role mapping
- Token signature validation
- Rate-limited Graph API integration
- Comprehensive error handling

**Supported Flows:**
- User login via Azure AD
- Automatic user creation
- Group membership sync
- Role mapping (admin, member, viewer)

## 🔧 Technology Stack

- **Backend**: NestJS, TypeScript, Kysely (database)
- **Frontend**: React, Mantine UI, React Query
- **Authentication**: OAuth 2.0 with OIDC
- **API Integration**: Microsoft Graph API v1.0

## 📊 Plugin Configuration

Configuration is stored per workspace in the `plugin_configurations` table with:
- Tenant ID (required)
- Client ID (required)  
- Client Secret (encrypted, required)
- OAuth scopes (optional)
- Group sync settings (optional)
- Validation flags (optional)
- Email domain filters (optional)

## 🔐 Security

All configuration including secrets is encrypted at rest in PostgreSQL. Secrets are redacted in API responses. See [SECURITY.md](./SECURITY.md) for detailed security practices.

## 📞 Support

For issues, see [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) or contact the Docmost team.
