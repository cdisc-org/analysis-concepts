# =============================================================================
# ANCOVA Change from Baseline ADAS-Cog(11) Week 24
# ANCOVA analysis of change from baseline with baseline site and treatment as covariates
# Generated from: S_AC_001
# =============================================================================

library(dplyr)
library(emmeans)

# Load data
adqsadas <- read.csv("adqsadas_ac.csv")

# Apply population filters
analysis_data <- adqsadas %>%
  filter(PARAM == "Adas-Cog(11) Subscore") %>%
  filter(AVISIT == "Week 24") %>%
  filter(EFFFL == "Y")

# Remove incomplete cases
analysis_data <- analysis_data[complete.cases(analysis_data[, c("CHG", "BASE", "SITEID", "TRTP")]), ]

# Convert factors
analysis_data$TRTP <- as.factor(analysis_data$TRTP)
analysis_data$SITEID <- as.factor(analysis_data$SITEID)

# Fit ANCOVA model
model <- lm(CHG ~ BASE + SITEID + TRTP, data = analysis_data)
cat("\n=== Model Summary ===\n")
print(summary(model))

# Calculate LS Means by treatment
cat("\n=== LS Means ===\n")
emm <- emmeans(model, specs = "TRTP")
print(summary(emm))

# Pairwise comparisons
cat("\n=== Pairwise Comparisons ===\n")
print(pairs(emm))

# Save results
write.csv(as.data.frame(summary(emm)), "treatment_results.csv", row.names = FALSE)
write.csv(as.data.frame(summary(pairs(emm))), "comparison_results.csv", row.names = FALSE)

cat("\n=== Results saved ===\n")
