package main

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

func ResolveBettererConflict(ctx context.Context, runner CommandRunner) error {
	// git diff -s --exit-code returns 1 if the file has changed
	if _, err := runner.Run(ctx, "git", "diff", "-s", "--exit-code", ".betterer.results"); err == nil {
		return errors.New(".better.results has not changed")
	}

	if _, err := runner.Run(ctx, "yarn", "run", "betterer"); err != nil {
		return err
	}

	if _, err := runner.Run(ctx, "git", "add", ".betterer.results"); err != nil {
		return err
	}

	if _, err := runner.Run(ctx, "git", "-c", "core.editor=true", "cherry-pick", "--continue"); err != nil {
		return err
	}

	return nil
}

func CreateCherryPickBranch(ctx context.Context, runner CommandRunner, branch string, opts BackportOpts) error {
	// Determine the list of SHAs to cherry-pick. Fallback to single SourceSHA for backward compatibility.
	shas := opts.SourceSHAs
	if len(shas) == 0 && strings.TrimSpace(opts.SourceSHA) != "" {
		shas = []string{opts.SourceSHA}
	}

	if len(shas) == 0 {
		return fmt.Errorf("no source SHAs provided for cherry-pick")
	}

	// 1. Ensure that we have the commits in the local history to cherry-pick
	for _, sha := range shas {
		if _, err := runner.Run(ctx, "git", "fetch", "origin", sha); err != nil {
			return fmt.Errorf("error fetching source commit %s: %w", sha, err)
		}
	}

	// 2. Ensure that the backport branch is in the local history.
	if _, err := runner.Run(ctx, "git", "fetch", "origin", fmt.Sprintf("%[1]s:refs/remotes/origin/%[1]s", opts.Target.Name)); err != nil {
		return fmt.Errorf("error fetching target branch: %w", err)
	}

	// 3 Ensure that we have enough context in the local history to cherry-pick
	if _, err := runner.Run(ctx, "git", "fetch", fmt.Sprintf("--shallow-since=%s", opts.MergeBase.Committer.Date.Format("2006-01-02"))); err != nil {
		return fmt.Errorf("error fetching source commit: %w", err)
	}

	if _, err := runner.Run(ctx, "git", "checkout", "-b", branch, "origin/"+opts.Target.Name); err != nil {
		return fmt.Errorf("error creating branch: %w", err)
	}

	// 4. Cherry-pick all commits sequentially
	for _, sha := range shas {
		if _, err := runner.Run(ctx, "git", "cherry-pick", "-x", sha); err != nil {
			if err := ResolveBettererConflict(ctx, runner); err == nil {
				continue
			}

			// Abort current cherry-pick sequence on error
			runner.Run(ctx, "git", "cherry-pick", "--abort")

			return fmt.Errorf("error running git cherry-pick for %s: %w", sha, err)
		}
	}

	return nil
}
