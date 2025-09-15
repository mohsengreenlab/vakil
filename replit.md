# Overview

This is a Persian Legal Firm web application that provides legal services, case management, and client interaction capabilities. The application serves as a comprehensive platform for a law firm offering services like legal case review, client consultation, and administrative management. It features both public-facing pages for potential clients and administrative interfaces for case management.

The application is built as a full-stack solution with a React frontend and Express backend, designed to handle legal case submissions, contact forms, client authentication, and administrative oversight of legal matters.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Framework**: Shadcn/ui components built on Radix UI primitives
- **Styling**: TailwindCSS with custom design tokens and CSS variables for theming
- **State Management**: TanStack Query for server state management
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation through @hookform/resolvers

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Template Engine**: EJS for server-side rendering of public pages
- **API Design**: RESTful API endpoints for data operations
- **Request Handling**: JSON and URL-encoded body parsing middleware
- **Development**: Vite integration for hot module replacement in development

## Data Storage Solutions
- **Database**: PostgreSQL configured through Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection**: Neon Database serverless driver for PostgreSQL connectivity
- **Fallback Storage**: In-memory storage implementation for development/testing

## Database Schema Design
The application uses four main entities:
- **Users**: Authentication and role management (admin/client roles)
- **Legal Cases**: Case submissions with client information, case type, urgency levels, and status tracking
- **Contacts**: General contact form submissions from website visitors
- **Case Events**: Event tracking system for legal cases with support for Persian legal event types like "صدور جلب", "مطالعه وکیل", "در انتظار رای دادگاه"

## Authentication and Authorization
- **User Management**: Username/password authentication system
- **Role-Based Access**: Admin and client role differentiation
- **Session Handling**: Cookie-based session management with PostgreSQL session store
- **Security**: Role-based route protection for administrative functions

## Application Structure
- **Multi-Page Application**: Server-rendered public pages for SEO and accessibility
- **Admin Interface**: React-based administrative dashboard for case management
- **Responsive Design**: Mobile-first approach with responsive breakpoints
- **Internationalization**: Persian/Farsi language support throughout the interface

## Development Workflow
- **Hot Reloading**: Vite development server with Express integration
- **Type Safety**: Full TypeScript coverage across frontend and backend
- **Code Organization**: Shared schema validation between client and server
- **Build Process**: Separate build processes for client (Vite) and server (esbuild)

# External Dependencies

## Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database operations and schema management
- **Drizzle Kit**: Database migration and schema synchronization tools

## UI and Component Libraries
- **Radix UI**: Unstyled, accessible UI components for complex interactions
- **Shadcn/ui**: Pre-built component library based on Radix UI primitives
- **Lucide React**: Icon library for consistent iconography
- **TailwindCSS**: Utility-first CSS framework for styling

## Development and Build Tools
- **Vite**: Frontend build tool and development server
- **esbuild**: Fast JavaScript bundler for server-side code
- **TypeScript**: Static type checking and enhanced developer experience
- **Replit Integration**: Development environment integration with runtime error handling

## Form and Validation
- **React Hook Form**: Performance-focused form library
- **Zod**: TypeScript-first schema validation
- **Drizzle-Zod**: Integration between Drizzle schemas and Zod validation

## State Management and Data Fetching
- **TanStack Query**: Server state management, caching, and synchronization
- **Date-fns**: Date manipulation and formatting utilities

## Session and Security
- **connect-pg-simple**: PostgreSQL session store for Express sessions
- **Express Session**: Session management middleware for user authentication