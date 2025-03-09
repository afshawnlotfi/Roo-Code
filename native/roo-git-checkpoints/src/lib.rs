#![deny(clippy::all)]

use napi_derive::napi;
use git2::{Repository, Signature, IndexAddOption, Config};
use std::path::{Path, PathBuf};
use std::time::Instant;
use std::fs;
use walkdir::WalkDir;
use rayon::prelude::*;

const GIT_DISABLED_SUFFIX: &str = "_disabled";

#[napi(object)]
pub struct InitResult {
  pub created: bool,
  pub duration_ms: u32,
  pub base_hash: String,
}

#[napi(object)]
pub struct SaveResult {
  pub commit_hash: Option<String>,
  pub duration_ms: u32,
}

#[napi]
pub struct RustCheckpointService {
  task_id: String,
  checkpoints_dir: String,
  workspace_dir: String,
  dot_git_dir: String,
  initialized: bool,
  base_hash: Option<String>,
}

#[napi]
impl RustCheckpointService {
  #[napi(constructor)]
  pub fn new(task_id: String, checkpoints_dir: String, workspace_dir: String) -> Self {
    let dot_git_dir = format!("{}/{}", checkpoints_dir, ".git");
    
    RustCheckpointService {
      task_id,
      checkpoints_dir,
      workspace_dir,
      dot_git_dir,
      initialized: false,
      base_hash: None,
    }
  }
  
  #[napi]
  pub fn init_shadow_git(&mut self) -> napi::Result<InitResult> {
    if self.initialized {
      return Err(napi::Error::new(
        napi::Status::GenericFailure,
        "Shadow git repo already initialized".to_string(),
      ));
    }
    
    let start = Instant::now();
    let mut created = false;
    
    // Create checkpoints directory if it doesn't exist
    fs::create_dir_all(&self.checkpoints_dir).map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to create checkpoints directory: {}", e),
      )
    })?;
    
    let repo = if Path::new(&self.dot_git_dir).exists() {
      // Open existing repository
      Repository::open(&self.checkpoints_dir).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to open git repository: {}", e),
        )
      })?
    } else {
      // Create new repository
      created = true;
      let repo = Repository::init(&self.checkpoints_dir).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to initialize git repository: {}", e),
        )
      })?;
      
      // Configure repository
      let mut config = repo.config().map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to get git config: {}", e),
        )
      })?;
      
      config.set_str("core.worktree", &self.workspace_dir).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to set core.worktree: {}", e),
        )
      })?;
      
      config.set_bool("commit.gpgSign", false).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to set commit.gpgSign: {}", e),
        )
      })?;
      
      config.set_str("user.name", "Roo Code").map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to set user.name: {}", e),
        )
      })?;
      
      config.set_str("user.email", "noreply@example.com").map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to set user.email: {}", e),
        )
      })?;
      
      repo
    };
    
    // Handle nested git repos
    self.rename_nested_git_repos(true)?;
    
    // Create initial commit if this is a new repository
    if created {
      // Create .gitignore
      let excludes_dir = Path::new(&self.dot_git_dir).join("info");
      fs::create_dir_all(&excludes_dir).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to create excludes directory: {}", e),
        )
      })?;
      
      let excludes_path = excludes_dir.join("exclude");
      fs::write(
        &excludes_path,
        "node_modules\n**/.git\ndist\nout\nbuild\n.DS_Store\n",
      )
      .map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to write excludes file: {}", e),
        )
      })?;
      
      // Stage all files
      self.stage_all(&repo)?;
      
      // Create initial commit
      let signature = Signature::now("Roo Code", "noreply@example.com").map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to create signature: {}", e),
        )
      })?;
      
      let tree_id = repo.index().map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to get index: {}", e),
        )
      })?.write_tree().map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to write tree: {}", e),
        )
      })?;
      
      let tree = repo.find_tree(tree_id).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to find tree: {}", e),
        )
      })?;
      
      let commit = repo
        .commit(
          Some("HEAD"),
          &signature,
          &signature,
          "initial commit",
          &tree,
          &[],
        )
        .map_err(|e| {
          napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to create commit: {}", e),
          )
        })?;
      
      self.base_hash = Some(commit.to_string());
    } else {
      // Get the current HEAD commit
      let head = repo.head().map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to get HEAD: {}", e),
        )
      })?;
      
      let commit = head.peel_to_commit().map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to peel to commit: {}", e),
        )
      })?;
      
      self.base_hash = Some(commit.id().to_string());
    }
    
    // Restore nested git repos
    self.rename_nested_git_repos(false)?;
    
    self.initialized = true;
    let duration = start.elapsed();
    
    Ok(InitResult {
      created,
      duration_ms: duration.as_millis() as u32,
      base_hash: self.base_hash.clone().unwrap_or_default(),
    })
  }
  
  #[napi]
  pub fn save_checkpoint(&mut self, message: String) -> napi::Result<SaveResult> {
    if !self.initialized {
      return Err(napi::Error::new(
        napi::Status::GenericFailure,
        "Shadow git repo not initialized".to_string(),
      ));
    }
    
    let start = Instant::now();
    
    // Open repository
    let repo = Repository::open(&self.checkpoints_dir).map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to open git repository: {}", e),
      )
    })?;
    
    // Stage all files
    self.stage_all(&repo)?;
    
    // Create commit
    let signature = Signature::now("Roo Code", "noreply@example.com").map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to create signature: {}", e),
      )
    })?;
    
    let tree_id = repo.index().map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to get index: {}", e),
      )
    })?.write_tree().map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to write tree: {}", e),
      )
    })?;
    
    let tree = repo.find_tree(tree_id).map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to find tree: {}", e),
      )
    })?;
    
    let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
    let parents = parent.iter().collect::<Vec<_>>();
    
    let commit_result = repo.commit(
      Some("HEAD"),
      &signature,
      &signature,
      &message,
      &tree,
      &parents,
    );
    
    let duration = start.elapsed();
    
    match commit_result {
      Ok(commit_id) => Ok(SaveResult {
        commit_hash: Some(commit_id.to_string()),
        duration_ms: duration.as_millis() as u32,
      }),
      Err(e) => {
        if e.code() == git2::ErrorCode::NotFound && e.message().contains("nothing to commit") {
          // No changes to commit
          Ok(SaveResult {
            commit_hash: None,
            duration_ms: duration.as_millis() as u32,
          })
        } else {
          Err(napi::Error::new(
            napi::Status::GenericFailure,
            format!("Failed to create commit: {}", e),
          ))
        }
      }
    }
  }
  
  // Private helper methods
  fn stage_all(&self, repo: &Repository) -> napi::Result<()> {
    // Disable nested git repos
    self.rename_nested_git_repos(true)?;
    
    // Stage all files
    let mut index = repo.index().map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to get index: {}", e),
      )
    })?;
    
    index
      .add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
      .map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to add files to index: {}", e),
        )
      })?;
    
    index.write().map_err(|e| {
      napi::Error::new(
        napi::Status::GenericFailure,
        format!("Failed to write index: {}", e),
      )
    })?;
    
    // Restore nested git repos
    self.rename_nested_git_repos(false)?;
    
    Ok(())
  }
  
  fn rename_nested_git_repos(&self, disable: bool) -> napi::Result<()> {
    // Find all .git directories that are not at the root level
    let pattern = if disable { "**/.git" } else { "**/.git_disabled" };
    
    let git_dirs: Vec<PathBuf> = WalkDir::new(&self.workspace_dir)
      .into_iter()
      .par_bridge() // Use parallel processing
      .filter_map(Result::ok)
      .filter(|entry| {
        let is_dir = entry.file_type().is_dir();
        let name = entry.file_name().to_string_lossy();
        let is_target = if disable {
          name == ".git"
        } else {
          name == ".git_disabled"
        };
        is_dir && is_target
      })
      .map(|entry| entry.path().to_path_buf())
      .collect();
    
    // Rename each nested .git directory
    for git_dir in git_dirs {
      // Skip the root .git directory
      if git_dir == Path::new(&self.dot_git_dir) {
        continue;
      }
      
      let new_path = if disable {
        format!("{}{}", git_dir.to_string_lossy(), GIT_DISABLED_SUFFIX)
      } else {
        let path_str = git_dir.to_string_lossy();
        path_str[..path_str.len() - GIT_DISABLED_SUFFIX.len()].to_string()
      };
      
      fs::rename(&git_dir, &new_path).map_err(|e| {
        napi::Error::new(
          napi::Status::GenericFailure,
          format!("Failed to rename git directory: {}", e),
        )
      })?;
    }
    
    Ok(())
  }
}

// Benchmark function
#[napi]
pub fn benchmark_checkpoint_operations(
  task_id: String,
  checkpoints_dir: String,
  workspace_dir: String,
) -> napi::Result<BenchmarkResult> {
  let start = Instant::now();
  
  let mut service = RustCheckpointService::new(task_id, checkpoints_dir, workspace_dir);
  
  // Initialize shadow git
  let init_start = Instant::now();
  let init_result = service.init_shadow_git()?;
  let init_duration = init_start.elapsed();
  
  // Save checkpoint
  let save_start = Instant::now();
  let save_result = service.save_checkpoint("Benchmark checkpoint".to_string())?;
  let save_duration = save_start.elapsed();
  
  let total_duration = start.elapsed();
  
  Ok(BenchmarkResult {
    init_duration_ms: init_duration.as_millis() as u32,
    save_duration_ms: save_duration.as_millis() as u32,
    total_duration_ms: total_duration.as_millis() as u32,
  })
}

#[napi(object)]
pub struct BenchmarkResult {
  pub init_duration_ms: u32,
  pub save_duration_ms: u32,
  pub total_duration_ms: u32,
}