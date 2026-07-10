package agent

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	adkartifact "google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

type fileArtifactService struct {
	root string
}

type fileArtifactVersionMeta struct {
	Version      int64     `json:"version"`
	CanonicalURI string    `json:"canonicalUri"`
	CreateTime   time.Time `json:"createTime"`
	MimeType     string    `json:"mimeType,omitempty"`
}

func newFileArtifactService(root string) adkartifact.Service {
	return &fileArtifactService{root: root}
}

func (s *fileArtifactService) Save(_ context.Context, req *adkartifact.SaveRequest) (*adkartifact.SaveResponse, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if req.Part == nil {
		return nil, fmt.Errorf("artifact part is required")
	}
	dir, err := s.artifactDir(req.AppName, req.UserID, req.SessionID, req.FileName)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	version := req.Version
	if version <= 0 {
		versions, err := s.versionsInDir(dir)
		if err != nil {
			return nil, err
		}
		version = int64(len(versions))
		if len(versions) > 0 {
			version = versions[len(versions)-1] + 1
		}
	}
	partPath := filepath.Join(dir, versionFile(version, ".part.json"))
	metaPath := filepath.Join(dir, versionFile(version, ".meta.json"))
	partData, err := json.Marshal(req.Part)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(partPath, partData, 0o644); err != nil {
		return nil, err
	}
	meta := fileArtifactVersionMeta{
		Version:      version,
		CanonicalURI: "file://" + filepath.ToSlash(partPath),
		CreateTime:   time.Now().UTC(),
		MimeType:     partMimeType(req.Part),
	}
	metaData, err := json.Marshal(meta)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(metaPath, metaData, 0o644); err != nil {
		return nil, err
	}
	return &adkartifact.SaveResponse{Version: version}, nil
}

func (s *fileArtifactService) Load(_ context.Context, req *adkartifact.LoadRequest) (*adkartifact.LoadResponse, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	dir, err := s.artifactDir(req.AppName, req.UserID, req.SessionID, req.FileName)
	if err != nil {
		return nil, err
	}
	version := req.Version
	if version <= 0 {
		version, err = s.latestVersion(dir)
		if err != nil {
			return nil, err
		}
	}
	data, err := os.ReadFile(filepath.Join(dir, versionFile(version, ".part.json")))
	if err != nil {
		return nil, err
	}
	var part genai.Part
	if err := json.Unmarshal(data, &part); err != nil {
		return nil, err
	}
	return &adkartifact.LoadResponse{Part: &part}, nil
}

func (s *fileArtifactService) Delete(_ context.Context, req *adkartifact.DeleteRequest) error {
	if err := req.Validate(); err != nil {
		return err
	}
	dir, err := s.artifactDir(req.AppName, req.UserID, req.SessionID, req.FileName)
	if err != nil {
		return err
	}
	if req.Version <= 0 {
		if err := os.RemoveAll(dir); errors.Is(err, os.ErrNotExist) {
			return nil
		} else {
			return err
		}
	}
	for _, suffix := range []string{".part.json", ".meta.json"} {
		if err := os.Remove(filepath.Join(dir, versionFile(req.Version, suffix))); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	return nil
}

func (s *fileArtifactService) List(_ context.Context, req *adkartifact.ListRequest) (*adkartifact.ListResponse, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	dir, err := s.sessionDir(req.AppName, req.UserID, req.SessionID)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return &adkartifact.ListResponse{}, nil
	}
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name, err := decodePathToken(entry.Name())
		if err != nil {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return &adkartifact.ListResponse{FileNames: names}, nil
}

func (s *fileArtifactService) Versions(_ context.Context, req *adkartifact.VersionsRequest) (*adkartifact.VersionsResponse, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	dir, err := s.artifactDir(req.AppName, req.UserID, req.SessionID, req.FileName)
	if err != nil {
		return nil, err
	}
	versions, err := s.versionsInDir(dir)
	if err != nil {
		return nil, err
	}
	return &adkartifact.VersionsResponse{Versions: versions}, nil
}

func (s *fileArtifactService) GetArtifactVersion(_ context.Context, req *adkartifact.GetArtifactVersionRequest) (*adkartifact.GetArtifactVersionResponse, error) {
	if err := req.Validate(); err != nil {
		return nil, err
	}
	dir, err := s.artifactDir(req.AppName, req.UserID, req.SessionID, req.FileName)
	if err != nil {
		return nil, err
	}
	version := req.Version
	if version <= 0 {
		version, err = s.latestVersion(dir)
		if err != nil {
			return nil, err
		}
	}
	meta, err := s.readVersionMeta(dir, version)
	if err != nil {
		return nil, err
	}
	return &adkartifact.GetArtifactVersionResponse{
		ArtifactVersion: &adkartifact.ArtifactVersion{
			Version:      meta.Version,
			CanonicalURI: meta.CanonicalURI,
			CreateTime:   meta.CreateTime,
			MimeType:     meta.MimeType,
		},
	}, nil
}

func (s *fileArtifactService) sessionDir(appName, userID, sessionID string) (string, error) {
	root, err := filepath.Abs(s.root)
	if err != nil {
		return "", err
	}
	return filepath.Join(root, userID, "adk-artifacts", encodePathToken(appName), encodePathToken(sessionID)), nil
}

func (s *fileArtifactService) artifactDir(appName, userID, sessionID, fileName string) (string, error) {
	sessionDir, err := s.sessionDir(appName, userID, sessionID)
	if err != nil {
		return "", err
	}
	return filepath.Join(sessionDir, encodePathToken(fileName)), nil
}

func (s *fileArtifactService) latestVersion(dir string) (int64, error) {
	versions, err := s.versionsInDir(dir)
	if err != nil {
		return 0, err
	}
	if len(versions) == 0 {
		return 0, os.ErrNotExist
	}
	return versions[len(versions)-1], nil
}

func (s *fileArtifactService) versionsInDir(dir string) ([]int64, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return []int64{}, nil
	}
	if err != nil {
		return nil, err
	}
	seen := map[int64]bool{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".part.json") {
			continue
		}
		raw := strings.TrimSuffix(entry.Name(), ".part.json")
		version, err := strconv.ParseInt(raw, 10, 64)
		if err == nil {
			seen[version] = true
		}
	}
	versions := make([]int64, 0, len(seen))
	for version := range seen {
		versions = append(versions, version)
	}
	sort.Slice(versions, func(i, j int) bool {
		return versions[i] < versions[j]
	})
	return versions, nil
}

func (s *fileArtifactService) readVersionMeta(dir string, version int64) (fileArtifactVersionMeta, error) {
	var meta fileArtifactVersionMeta
	data, err := os.ReadFile(filepath.Join(dir, versionFile(version, ".meta.json")))
	if err != nil {
		return meta, err
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		return meta, err
	}
	return meta, nil
}

func versionFile(version int64, suffix string) string {
	return fmt.Sprintf("%012d%s", version, suffix)
}

func encodePathToken(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func decodePathToken(value string) (string, error) {
	data, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func partMimeType(part *genai.Part) string {
	if part == nil || part.InlineData == nil {
		return ""
	}
	return part.InlineData.MIMEType
}
