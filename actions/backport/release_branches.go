package main

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/go-github/v50/github"

	"github.com/webitel/reusable-workflows/actions/backport-action/ghutil"
)

var (
	ErrorNotMerged     = errors.New("pull request is not merged; nothing to do")
	ErrorBadAction     = errors.New("unrecognized action")
	ErrorNoLabels      = errors.New("no labels found")
	ErrorNoBranchFound = errors.New("no release branch found")
)

func BackportTargetsFromPayload(branches []*github.Branch, prInfo PrInfo) ([]ghutil.Branch, error) {
	if !prInfo.Pr.GetMerged() {
		return nil, ErrorNotMerged
	}

	if len(prInfo.Labels) == 0 {
		return nil, ErrorNoLabels
	}

	return BackportTargets(branches, prInfo.Labels)
}

func BackportTargets(branches []*github.Branch, labels []string) ([]ghutil.Branch, error) {
	targets := []ghutil.Branch{}
	for _, label := range labels {
		if !strings.HasPrefix(label, "backport ") {
			continue
		}

		target := BackportTarget(label)
		for _, v := range branches {
			if v.GetName() == target {
				targets = append(targets, ghutil.Branch{Name: target})
			}
		}
	}

	if len(targets) == 0 {
		return nil, fmt.Errorf("%w: %s", ErrorNoBranchFound, labels)
	}

	return targets, nil
}

// BackportTarget finds the most appropriate base branch (target) given the backport label 'label'
// This function takes the label, like `backport v11.2.x`, and finds the most recent `release-` branch
// that matches the pattern.
func BackportTarget(label string) string {
	return strings.TrimPrefix(label, "backport ")
}

func MergeBase(ctx context.Context, client *github.RepositoriesService, owner, repo, base, head string) (*github.Commit, error) {
	comp, _, err := client.CompareCommits(ctx, owner, repo, base, head, &github.ListOptions{})
	if err != nil {
		return nil, err
	}

	return comp.MergeBaseCommit.Commit, nil
}
