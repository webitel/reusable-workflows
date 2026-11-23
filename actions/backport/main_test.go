package main

import (
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/google/go-github/v50/github"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/webitel/reusable-workflows/actions/backport-action/ghutil"
)

func TestBackportTargets_reportsEveryFailedTarget(t *testing.T) {
	var comments int
	mux := http.NewServeMux()
	mux.HandleFunc("GET /repos/webitel/repo/compare/release-1.0...main", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"message":"boom"}`, http.StatusInternalServerError)
	})
	mux.HandleFunc("GET /repos/webitel/repo/compare/release-2.0...main", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"merge_base_commit":{"commit":{"committer":{"date":"2020-01-02T00:00:00Z"}}}}`)
	})
	mux.HandleFunc("GET /repos/webitel/repo/pulls/7/commits", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `[{"sha":"asdf1234"}]`)
	})
	mux.HandleFunc("POST /repos/webitel/repo/issues/7/comments", func(w http.ResponseWriter, _ *http.Request) {
		comments++
		w.WriteHeader(http.StatusCreated)
		_, _ = io.WriteString(w, `{}`)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	client := github.NewClient(srv.Client())
	client.BaseURL, _ = url.Parse(srv.URL + "/")

	prInfo := PrInfo{
		Pr: &github.PullRequest{
			Number: github.Int(7),
			Base:   &github.PullRequestBranch{Ref: github.String("main")},
		},
		RepoOwner: "webitel",
		RepoName:  "repo",
	}
	targets := []ghutil.Branch{{Name: "release-1.0"}, {Name: "release-2.0"}}
	runner := NewErrorRunner(map[string]error{
		"git cherry-pick -x asdf1234": errors.New("conflict"),
	})
	log := slog.New(slog.NewTextHandler(io.Discard, nil))

	err := backportTargets(t.Context(), log, client, runner, prInfo, targets, nil)

	require.Error(t, err)
	assert.ErrorContains(t, err, "release-1.0")
	assert.ErrorContains(t, err, "release-2.0")
	assert.Equal(t, 1, comments)
}
