# Glossary

### Analysis Concepts Framework

The complete framework. Consists of two layers: [Specification Layer](#specification-layer) and [Execution Layer](#execution-layer). High level components include [Method](#method), [Transformation](#transformation), [Concept](#concept), [Code](#code) and [Data Binding](#data-binding).

### Code

Actual code in SAS, R, Python, etc. Code refers to a [Method](#method). One [Method](#method) can be referred to by many pieces of Code in different programming languages. Code is part of the [Execution Layer](#execution-layer) and is therefore not language-agnostic.

### Concept

Has meaning in the real world. Concept is part of the [Specification Layer](#specification-layer) and is therefore independent of data and data standards. One Concept can have multiple roles in different [Transformation](#transformation)s.

### Data Binding

Implementation of a [Concept](#concept) in data and data standards. Data Binding is part of the [Execution Layer](#execution-layer) and is therefore dependent of data and data standards.

### Execution Layer

The machine-readable and executable layer of the [Analysis Concepts Framework](#analysis-concepts-framework). This layer contains the implementation of the [Specification Layer](#specification-layer). High level components include [Code](#code) and [Data Binding](#data-binding). This layer is concrete, syntactic and physical.


### Method

Pure operations with inputs and outputs. Inputs and outputs have roles for a Method. One Method can be referred to by many [Transformation](#transformation)s. Method knows nothing of [Concept](#concept)s. Method is part of the [Specification Layer](#specification-layer) and is therefore language-agnostic.

### Smartphrase

User-facing attribute of [Transformation](#transformation). Used to build and describe [Transformation](#transformation) in a human-readable way.

### Specification Layer

The human-readable layer of the [Analysis Concepts Framework](#analysis-concepts-framework). All content has meaning in the real world, and is independent of data, data standards, tooling and programming languages. High level components include [Method](#method), [Transformation](#transformation) and [Concept](#concept). This layer is abstract, semantic and logical.

### Transformation

Applied [Method](#method) binding [Concept](#concept)s to roles. Transformation is part of the [Specification Layer](#specification-layer) and is therefore language-agnostic and independent of data and data standards. [Smartphrase](#smartphrase) is the user-facing attribute of Transformation.