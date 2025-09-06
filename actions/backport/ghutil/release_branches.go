package ghutil

import (
	"context"
	"log/slog"

	"github.com/google/go-github/v50/github"
)

type BranchClient interface {
	ListBranches(ctx context.Context, owner string, repo string, opts *github.BranchListOptions) ([]*github.Branch, *github.Response, error)
}

type Branch struct {
	Name  string
	SHA   string
	Major string
	Minor string
	Patch string
}

func GetReleaseBranches(ctx context.Context, log *slog.Logger, client BranchClient, owner, repo string) ([]*github.Branch, error) {
	var (
		page     int
		count    = 50
		branches = []*github.Branch{}
	)

	for {
		log.Debug("listing branches", "page", page, "count", count)
		b, r, err := client.ListBranches(ctx, owner, repo, &github.BranchListOptions{
			Protected: github.Bool(false), // TODO: change this when we have protected branches
			ListOptions: github.ListOptions{
				Page:    page,
				PerPage: count,
			},
		})
		if err != nil {
			return nil, err
		}

		branches = append(branches, b...)
		if r.NextPage == 0 {
			break
		}

		page = r.NextPage
	}

	return branches, nil
}
