package logging

import "testing"

func TestConfigureSupportsJSONAndConsole(t *testing.T) {
	for _, format := range []string{"json", "console"} {
		logger, err := Configure("test-service", Config{Level: "debug", Format: format})
		if err != nil {
			t.Fatalf("Configure(%q) returned error: %v", format, err)
		}
		_ = logger.Sync()
	}
}

func TestConfigureRejectsInvalidConfig(t *testing.T) {
	if _, err := Configure("test-service", Config{Level: "trace", Format: "json"}); err == nil {
		t.Fatal("expected invalid level to return an error")
	}
	if _, err := Configure("test-service", Config{Level: "info", Format: "text"}); err == nil {
		t.Fatal("expected invalid format to return an error")
	}
}
