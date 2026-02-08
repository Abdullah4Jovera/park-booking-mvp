require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoose = require("mongoose");

const redisClient = require("./config/redis");
const bullBoard = require("./bullboard");

// Routes
const attractionRoutes = require("./routes/attraction.routes");
const bookingRoutes = require("./routes/booking.routes");

const app = express();

/* ======================================================
   MIDDLEWARE
====================================================== */

// Security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: process.env.NODE_ENV === "production"
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  })
);

// CORS
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Logging
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Response time header
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e6;
    res.setHeader("X-Response-Time", `${duration.toFixed(2)}ms`);
  });
  next();
});

/* ======================================================
   ROUTES
====================================================== */

app.get("/", (req, res) => {
  res.json({
    service: "Park Booking API 🚀",
    version: "1.0.0",
    status: "operational",
    uptime: process.uptime(),
    endpoints: {
      attractions: "/api/attractions",
      bookings: "/api/bookings",
      health: "/health",
      metrics: "/metrics",
      queues: "/admin/queues",
    },
  });
});

// Health check (never throw)
app.get("/health", async (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      mongodb:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      redis: redisClient.status || "unknown",
    },
  });
});

// Metrics (safe diagnostics)
app.get("/metrics", (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    process: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      nodeVersion: process.version,
    },
    connections: {
      mongodb: mongoose.connection.readyState,
      redis: redisClient.status,
    },
  });
});

// API routes
app.use("/api/attractions", attractionRoutes);
app.use("/api/bookings", bookingRoutes);

// Bull Board (protect in prod!)
app.use("/admin/queues", bullBoard.router);

/* ======================================================
   ERROR HANDLING
====================================================== */

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Not Found",
    message: `Route ${req.originalUrl} does not exist`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 API Error", {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
  });

  if (res.headersSent) return next(err);

  const statusCode = err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  const payload = {
    success: false,
    message:
      isProd && statusCode === 500
        ? "Internal Server Error"
        : err.message,
    path: req.originalUrl,
    timestamp: new Date().toISOString(),
  };

  if (!isProd) payload.stack = err.stack;
  if (err.name === "ValidationError") payload.errors = err.errors;

  res.status(statusCode).json(payload);
});

module.exports = app;
