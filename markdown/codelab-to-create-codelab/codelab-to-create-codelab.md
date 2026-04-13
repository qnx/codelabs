id: codelab-to-create-codelab
title: Template to Create Codelabs
summary: Learn how to contribute to QNX Codelabs
categories: codelabs, setup
tags: beginner
difficulty: 1
status: published
authors: Shweta Mazumder
feedback_link: https://github.com/qnx/codelabs/issues


# How to Create Your Own Codelab and Contribute to QNX

## Welcome
Duration: 2:00

### Overview
This codelab will show you **how to create your own Codelab** and contribute to QNX.  
We use the open-source [Google Codelabs Tools](https://github.com/googlecodelabs/tools) to author codelabs.

### Workflow
Below is the high level workflow on what we will do as part of this codelab

![Codelab Workflow Diagram](FlowDiagram.png) 

### Resources
QNX Customized Claat Tool used in this codelab - [Github Repo ](https://github.com/qnx/tools) 

Forum for Codelab Authors - [Forum Link](https://groups.google.com/forum/#!forum/codelab-authors)

View the markdown for this codelab - [Markdown File](https://raw.githubusercontent.com/qnx/codelabs/refs/heads/main/markdown/codelab-to-create-codelab/codelab-to-create-codelab.md)

<!--
### Video
Video showing **how to create your own Codelab** and **contribute to QNX**
-->
---

## Setup Environment
Duration: 5:00

### Pre-requisites

1. **Download an IDE or Editor** – [VS Code](https://code.visualstudio.com/download) is recommended.  
2. **Learn GitHub Basics:** [Learn GitHub](https://learn.github.com/skills)  
3. **Install Go** from [Go Get](https://go.dev/doc/install)  (needed if using Claat)
    ```bash
    # Install go globally as environment variable
    export PATH=$PATH:/usr/local/go/bin
    export GOPATH=$HOME/go
    export PATH=$PATH:$GOPATH/bin
    ```
4. **Build or install Claat** to view your markdown file locally as a static HTML (optional)

---

### Build Claat from Source

1. We have taken Google's Open Source Claat Tool and customized it per our needs. Therefore, build the tool from [QNX Repo - Claat Tool](https://github.com/qnx/tools)
    ```bash
    git clone https://github.com/qnx/tools.git
    ```
2. Navigate to the Claat folder:
    ```bash
    cd tools/claat
    ```
3. Build Claat: Running go from claat folder compiles it and put the executable to your path 
    ```bash
    go install
    ```
4. Verify go and claat install by opening terminal
   ```bash
   go version
   claat --help
   ```

Your system should be ready to get started!

---

## Guidelines for Creating Codelabs
Duration: 1:00

- Focus on **one specific goal** per codelab.  
- Add an **Introduction** describing the codelab purpose and outcome.  
- Include a **System Setup** section for pre-requisites.  
- Use **code snippets** and **videos** where necessary.  
- Break content into **small, independent sections**.  
- Always create a **GitHub branch** for your contributions.

---

## Setup Repo for Codelab
Duration: 2:00

1. Fork [QNX Codelabs Repo](https://github.com/qnx/codelabs)

2. Clone the QNX codelabs repo:
    ```bash
    git clone https://github.com/qnx/codelabs.git
    ```
3. If using SSH:
    ```bash
    git clone git@github.com:qnx/codelabs.git
    ```
4. It is mandatory to work on a **new branch** , therefore create your branch where you will commit , push your changes before creating a pull request to codelabs main repo:
    ```bash
    git checkout -b <name-of-your-codelab>
    ```

---

## Create a new Codelab
Duration: 3:00

This section explains how to create a new codelab.

You will only work in the `markdown` folder under your created codelab repo.  
Ensure you do **not** make any changes to other folders or files to successfully contribute to our codelabs.  
Inconsistencies or changes to other files will unfortunately result in a rejected Pull Request.

1. cd to Codelabs

2. Create a New Folder for your codelab at ~./markdown/<name-of-your-codelab>:

    ```bash
    mkdir -p ./codelabs/markdown/<name-of-your-codelab>
    ```
2. Copy `markdown-template.md` into your newly created folder to  ensure the required tags are included.

    The id tag must exactly match the .md filename for claat to work correctly.

    ```bash

    id: name-of-your-codelab
    title: template to create codelabs
    summary: Learn how to add new Codelabs
    categories: codelabs, setup
    tags: beginner
    difficulty: 1
    status: published
    authors: Your Team
    feedback_link: https://github.com/qnx/codelabs/issues
    
    ```

3. Rename the markdown file as your `<name-of-your-codelab>.md`


4. (Optional) Run claat to view your `<name-of-your-codelab>.md` file locally as html. Otherwise, skip to step 7

    ```bash
    //cd out from ~./markdown/<name-of-your-codelab> folder to ~./codelabs
    
    claat export -f html -o docs ./markdown/<name-of-your-codelab>/<name-of-your-codelab>.md
    
    ```
5. You will see a similar output as below in terminal and a folder created same as `<name-of-your-codelab>` file under ~./codelabs/docs

![Claat Output](claat-screenshot.png) 


6. Now run claat server to view the html locally at `http://localhost:8000` from ~./codelabs/docs/<name-of-your-codelab> folder

    ```bash
    //cd to ./codelabs/docs/<name-of-your-codelab>
    
    claat serve index.md
    
    ```
7. Stage your changes to submit a Pull Request

    ```bash
    //from ~./codelabs/markdown/<name-of-your-codelab> folder

    git add .
    git commit -m "add comments for your commit"
    git push -u origin name-of-your-codelab
    
    ```

Congratulations! We will review and add your Pull Request soon. Thank you for contributing to QNX Codelabs!

---