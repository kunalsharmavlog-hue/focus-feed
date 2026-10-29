// Shared by the content scripts and the popup.
const FF_PRESETS = {
  editing: [
    "edit", "video edit", "videoedit", "editor", "premiere", "after effects", "aftereffects",
    "davinci", "capcut", "final cut", "finalcut", "color grading", "colorgrading",
    "colour grading", "transition", "vfx", "motion graphics", "motiongraphics", "keyframe",
    "alight motion", "alightmotion", "velocity", "lightroom", "photoshop", "b-roll", "broll",
    "luts", "vn editor", "sound design",
    // Launch videos, trailers, creativity, direction
    "launch video", "launch film", "product launch", "launchvideo", "trailer", "teaser",
    "promo", "brand film", "commercial", "ad film", "adfilm", "sizzle", "creative",
    "creativity", "director", "directed by", "filmmaker", "filmmaking", "cinematic",
    "cinematograph", "director of photography", "storyboard", "motion design",
    "behind the scenes"
  ],
  coding: [
    "coding", "code", "programming", "programmer", "developer", "javascript", "python",
    "react", "webdev", "web development", "dsa", "leetcode", "software", "github", "ai tools"
  ],
  fitness: [
    "workout", "gym", "fitness", "exercise", "protein", "diet", "bodybuilding", "yoga",
    "calisthenics", "fat loss", "muscle"
  ],
  cooking: [
    "recipe", "cooking", "food", "kitchen", "chef", "baking"
  ]
};

// Topic Reels searches Instagram for these, one after another
const FF_TOPICS = [
  "video editing", "launch video", "movie trailer", "creative director", "after effects",
  "premiere pro", "color grading", "motion graphics", "filmmaking", "product launch film",
  "davinci resolve", "creativity", "cinematic edit", "ad film"
];

const FF_DEFAULTS = {
  enabled: true,
  autoSkip: true,
  saveLiked: true,          // only does anything once the optional downloader is installed
  showDownloadButton: true,
  useLogin: false,          // opt-in: share instagram.com cookies with the local downloader
  keywords: FF_PRESETS.editing.join("\n"),
  blockWords: "",
  accounts: "",
  topics: FF_TOPICS.join("\n")
};
