package agent

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"gitlab.weajp.com/netxscan/chain287/netx-ai/agent-server/internal/model"
	adkmodel "google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

func TestNewGeminiModelSupportsGeminiRelayProvider(t *testing.T) {
	type relayRequest struct {
		Contents []struct {
			Role  string `json:"role"`
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"contents"`
	}
	type capturedRequest struct {
		Method        string
		Path          string
		Authorization string
		Body          relayRequest
	}

	captured := make(chan capturedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body relayRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		captured <- capturedRequest{
			Method:        r.Method,
			Path:          r.URL.RequestURI(),
			Authorization: r.Header.Get("Authorization"),
			Body:          body,
		}

		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"candidates": [
				{
					"content": {
						"role": "model",
						"parts": [{"text": "relay ok"}]
					},
					"finishReason": "STOP"
				}
			],
			"usageMetadata": {
				"promptTokenCount": 1,
				"candidatesTokenCount": 1,
				"totalTokenCount": 2
			}
		}`))
	}))
	defer server.Close()

	llm, err := newGeminiModel(context.Background(), model.LLMConfig{
		Provider: "gemini-relay",
		Model:    "gemini-2.5-pro",
		APIKey:   "sk-relay-test",
		BaseURL:  server.URL,
	}, nil)
	if err != nil {
		t.Fatalf("newGeminiModel() error = %v", err)
	}

	var gotText string
	responseCount := 0
	for resp, err := range llm.GenerateContent(context.Background(), &adkmodel.LLMRequest{
		Contents: []*genai.Content{
			genai.NewContentFromText("hello relay", genai.RoleUser),
		},
	}, false) {
		if err != nil {
			t.Fatalf("GenerateContent() error = %v", err)
		}
		responseCount++
		if resp.Content != nil && len(resp.Content.Parts) > 0 {
			gotText = resp.Content.Parts[0].Text
		}
	}

	if responseCount != 1 {
		t.Fatalf("response count = %d", responseCount)
	}
	if gotText != "relay ok" {
		t.Fatalf("response text = %q", gotText)
	}

	select {
	case got := <-captured:
		if got.Method != http.MethodPost {
			t.Fatalf("method = %s", got.Method)
		}
		if got.Path != "/v1beta/models/gemini-2.5-pro:generateContent" {
			t.Fatalf("path = %q", got.Path)
		}
		if got.Authorization != "Bearer sk-relay-test" {
			t.Fatalf("Authorization = %q", got.Authorization)
		}
		if len(got.Body.Contents) != 1 || got.Body.Contents[0].Role != "user" {
			t.Fatalf("contents = %+v", got.Body.Contents)
		}
		if len(got.Body.Contents[0].Parts) != 1 || got.Body.Contents[0].Parts[0].Text != "hello relay" {
			t.Fatalf("parts = %+v", got.Body.Contents[0].Parts)
		}
	default:
		t.Fatal("relay server was not called")
	}
}
