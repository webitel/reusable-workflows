package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/google/go-github/v50/github"
	"github.com/sethvargo/go-githubactions"

	"github.com/webitel/reusable-workflows/actions/backport-action/ghutil"
)

type Inputs struct {
	Title  string
	Labels []*github.Label
}

func GetInputs() Inputs {
	var (
		labelsStr = githubactions.GetInput("labels_to_add")
	)

	labelStrings := strings.Split(labelsStr, ",")
	labels := make([]*github.Label, len(labelStrings))
	for i, v := range labelStrings {
		labels[i] = &github.Label{
			Name: github.String(v),
		}
	}

	return Inputs{
		Labels: labels,
	}
}

func main() {
	log := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	ghctx, err := githubactions.Context()
	if err != nil {
		log.Error("error reading github context", "error", err)
		panic(err)
	}

	var (
		ctx    = context.Background()
		token  = os.Getenv("GITHUB_TOKEN")
		client = github.NewTokenClient(ctx, token)
		inputs = GetInputs()

		// If specified, takes precedence over event data
		repoOwner   = os.Getenv("REPO_OWNER")
		repoName    = os.Getenv("REPO_NAME")
		prNumber, _ = strconv.Atoi(os.Getenv("PR_NUMBER"))
		prLabel     = os.Getenv("PR_LABEL")
	)

	if token == "" {
		panic("token can not be empty")
	}

	prInfo, err := GetBackportPrInfo(ctx, log, client, ghctx, repoOwner, repoName, prNumber, prLabel)
	if err != nil {
		log.Error("error getting PR info", "error", err)
		panic(err)
	}

	log = log.With("repo", fmt.Sprintf("%s/%s", prInfo.RepoOwner, prInfo.RepoName), "pull_request", prInfo.Pr.GetNumber())

	branches, err := ghutil.GetReleaseBranches(ctx, log, client.Repositories, prInfo.RepoOwner, prInfo.RepoName)
	if err != nil {
		log.Error("error getting branches", "error", err)
		panic(err)
	}

	targets, err := BackportTargetsFromPayload(branches, prInfo)
	if err != nil {
		if errors.Is(err, ErrorNotMerged) {
			log.Warn("pull request is not merged; nothing to do")
			return
		}

		log.Error("error getting backport targets", "error", err, "branches", branches)
		panic(err)
	}

	labels := append(inputs.Labels, prInfo.Pr.Labels...)
	if err := backportTargets(ctx, log, client, NewShellCommandRunner(log), prInfo, targets, labels); err != nil {
		log.Error("one or more backports failed", "error", err)
		os.Exit(1)
	}
}

func backportTargets(ctx context.Context, log *slog.Logger, client *github.Client, runner CommandRunner, prInfo PrInfo, targets []ghutil.Branch, labels []*github.Label) error {
	var errs []error
	for _, target := range targets {
		log := log.With("target", target)
		pr, err := backportTarget(ctx, log, client, runner, prInfo, target, labels)
		if err != nil {
			log.Error("backport failed", "error", err)
			errs = append(errs, fmt.Errorf("backport to %s: %w", target.Name, err))
			continue
		}

		log.Info("backport successful", "url", pr.GetURL())
	}

	return errors.Join(errs...)
}

func backportTarget(ctx context.Context, log *slog.Logger, client *github.Client, runner CommandRunner, prInfo PrInfo, target ghutil.Branch, labels []*github.Label) (*github.PullRequest, error) {
	mergeBase, err := MergeBase(ctx, client.Repositories, prInfo.RepoOwner, prInfo.RepoName, target.Name, prInfo.Pr.GetBase().GetRef())
	if err != nil {
		return nil, fmt.Errorf("finding merge-base: %w", err)
	}

	// Collect all commit SHAs from the PR to cherry-pick in order
	var sourceSHAs []string
	commits, _, err := client.PullRequests.ListCommits(ctx, prInfo.RepoOwner, prInfo.RepoName, prInfo.Pr.GetNumber(), &github.ListOptions{PerPage: 100})
	if err != nil {
		log.Error("error listing PR commits", "error", err)
	} else {
		for _, c := range commits {
			if c.GetSHA() != "" {
				sourceSHAs = append(sourceSHAs, c.GetSHA())
			}
		}
	}

	// Fallback to merge commit SHA if commit list is empty (e.g., API issue), keeping backward compatibility
	fallbackSHA := prInfo.Pr.GetMergeCommitSHA()
	if fallbackSHA == "" && len(sourceSHAs) > 0 {
		fallbackSHA = sourceSHAs[len(sourceSHAs)-1]
	}

	opts := BackportOpts{
		PullRequestNumber: prInfo.Pr.GetNumber(),
		SourceSHA:         fallbackSHA,
		SourceSHAs:        sourceSHAs,
		SourceCommitDate:  prInfo.Pr.GetMergedAt().Time,
		SourceTitle:       prInfo.Pr.GetTitle(),
		SourceBody:        prInfo.Pr.GetBody(),
		Target:            target,
		Labels:            labels,
		Owner:             prInfo.RepoOwner,
		Repository:        prInfo.RepoName,
		MergeBase:         mergeBase,
	}

	return Backport(ctx, log, client.PullRequests, client.Issues, client.Issues, runner, opts)
}
