package logging

import (
	"fmt"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

const (
	defaultLogLevel  = "info"
	defaultLogFormat = "json"
)

type Config struct {
	Level  string
	Format string
}

func Configure(service string, cfg Config) (*zap.Logger, error) {
	level, err := parseLevel(cfg.Level)
	if err != nil {
		return nil, err
	}

	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.TimeKey = "ts"
	encoderConfig.MessageKey = "msg"
	encoderConfig.LevelKey = "level"
	encoderConfig.CallerKey = "caller"
	encoderConfig.StacktraceKey = "stacktrace"
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderConfig.EncodeLevel = zapcore.LowercaseLevelEncoder
	encoderConfig.EncodeDuration = zapcore.StringDurationEncoder

	encoding := strings.ToLower(strings.TrimSpace(cfg.Format))
	if encoding == "" {
		encoding = defaultLogFormat
	}
	switch encoding {
	case "json", "console":
	default:
		return nil, fmt.Errorf("unsupported log format %q", cfg.Format)
	}

	zapCfg := zap.Config{
		Level:             zap.NewAtomicLevelAt(level),
		Development:       encoding == "console",
		Encoding:          encoding,
		EncoderConfig:     encoderConfig,
		OutputPaths:       []string{"stdout"},
		ErrorOutputPaths:  []string{"stderr"},
		DisableStacktrace: level > zapcore.DebugLevel,
	}
	logger, err := zapCfg.Build(
		zap.AddCaller(),
		zap.AddStacktrace(zapcore.ErrorLevel),
		zap.Fields(zap.String("service", service)),
	)
	if err != nil {
		return nil, err
	}
	zap.ReplaceGlobals(logger)
	_ = zap.RedirectStdLog(logger)
	return logger, nil
}

func parseLevel(value string) (zapcore.Level, error) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "info":
		return zapcore.InfoLevel, nil
	case "debug":
		return zapcore.DebugLevel, nil
	case "warn", "warning":
		return zapcore.WarnLevel, nil
	case "error":
		return zapcore.ErrorLevel, nil
	default:
		return zapcore.InfoLevel, fmt.Errorf("unsupported log level %q", value)
	}
}
