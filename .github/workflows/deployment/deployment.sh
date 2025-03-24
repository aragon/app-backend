#!/bin/bash

# Set Bash options for better error handling
set -eo

# Variables
set_vars(){
    REPO_BRANCH="${REPO_BRANCH:-develop}"
    REPO_URL="${REPO_URL:-git@github.com:aragon/app-backend.git}"

    TARGET_DIR="app-backend"
    ARCHIVE_NAME="backend.tar"
    REMOTE_DIR="/home/${REMOTE_USER}"
    REMOTE_SCRIPT_NAME='remote_script.sh'
    #PEM_FILE="aragon-backend.pem"
}
echo "Starting deployment..."

check_vars_exist() {
    echo -e "\n\n Checking if all required variables are set..."
    local missing_vars=0

    # List of required variables
    local required_vars=("REMOTE_HOST" "REMOTE_USER" "TARGET_DIR" "ARCHIVE_NAME" "REMOTE_DIR")

    for var in "${required_vars[@]}"; do
        if [ -z "${!var:-}" ]; then
            echo "Error: $var is not set."
            missing_vars=1
        fi
    done

    if [ $missing_vars -eq 1 ]; then
        echo "One or more required variables are missing. Exiting..."
        exit 1
    else
        echo "All required variables are set."
    fi
}

# Function to clone the repository
clone_repo() {
    echo -e "\n\n Cloning repository from $REPO_URL branch $REPO_BRANCH..."
    git clone -b "$REPO_BRANCH" "$REPO_URL" "$TARGET_DIR"
}

# Function to create a tar archive
create_tar() {
    echo -e "\n\n Creating tar archive of $TARGET_DIR..."
    tar -cf "$ARCHIVE_NAME" "$TARGET_DIR"
}

# Function to copy the tar file to the remote server
copy_tar_to_remote() {
    echo -e "\n\n Copying $ARCHIVE_NAME to $REMOTE_HOST..."
    scp "$ARCHIVE_NAME" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"
}

# Function to clean up local files
cleanup_local() {
    echo -e "\n\n Cleaning up local files..."
    rm -rf "$TARGET_DIR" "$ARCHIVE_NAME"
}

# Ensure known_hosts file is updated to avoid host key verification failure
update_known_hosts(){
    mkdir -p ~/.ssh/
    if [ -n "$REMOTE_HOST" ]; then
        echo "Updating known_hosts to avoid host key verification failure..."
        ssh-keyscan -H "$REMOTE_HOST" >> ~/.ssh/known_hosts 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "Successfully updated known_hosts with $REMOTE_HOST."
        else
            echo "Failed to update known_hosts. Please check the remote host IP and try again."
        fi
    else
        echo "REMOTE_HOST is not set. Skipping known_hosts update."
    fi
}

# Function to remove logs on the remote server
remote_remove_logs() {
    echo -e "\n\n Removing old logs on remote server..."
    ssh "$REMOTE_USER@$REMOTE_HOST" "rm -rf $REMOTE_DIR/.pm2/logs/*"
}

# Function to clean the old install
remote_clean_old_install() {
    echo -e "\n\n Remote: Removing old directory..."
    ssh "$REMOTE_USER@$REMOTE_HOST" "rm -rf $REMOTE_DIR/$TARGET_DIR"
}

# Function to remote extract the uploaded tar file
remote_extract_files() {
    echo -e "\n\n Remote: Extracting remote $ARCHIVE_NAME..."
    ssh "$REMOTE_USER@$REMOTE_HOST" "tar -xf $REMOTE_DIR/$ARCHIVE_NAME -C $REMOTE_DIR ; rm $REMOTE_DIR/$ARCHIVE_NAME"

}

# Function copy in the remote the var files to the dir
# This is just for testing when you have files locally, GitHub flow will retrieve the config and upload it in the .tar directly
# You have to upload the files previously to the machine
remote_restore_envfiles_remotely() {
    echo -e "\n\n Remote: Copying environment files previously updated (for manual testing). You must updated the files before manually to ($REMOTE_DIR/manual_envfiles/ )..."
    ssh "$REMOTE_USER@$REMOTE_HOST" << EOF
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-api $REMOTE_DIR/$TARGET_DIR/.env.aragon-api
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-indexer $REMOTE_DIR/$TARGET_DIR/.env.aragon-indexer
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-dao $REMOTE_DIR/$TARGET_DIR/.env.aragon-dao
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-transactions $REMOTE_DIR/$TARGET_DIR/.env.aragon-transactions
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-plugins $REMOTE_DIR/$TARGET_DIR/.env.aragon-plugins
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-rates $REMOTE_DIR/$TARGET_DIR/.env.aragon-rates
    cp $REMOTE_DIR/manual_envfiles/.env.aragon-sync $REMOTE_DIR/$TARGET_DIR/.env.aragon-sync
EOF
}

remote_upload_execute_script(){
    echo -e "\n\n Remote: Upload executing script script on $REMOTE_HOST..."

    cat > $REMOTE_SCRIPT_NAME << EOF
#!/bin/bash
echo "Starting remote script execution..."
#set -x
set -e
set -o pipefail



echo ant \$NVM_AUTO_USE
echo desp \$NVM_AUTO_USE

install_dependencies() {
    echo "Installing dependencies..."
    cd "$REMOTE_DIR/$TARGET_DIR"
    if ! command -v nvm &> /dev/null; then
        echo "nvm NOT installed. Installing"
        #sometimes this fails due to permission, connect and
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
        if [ -z "$NVM_AUTO_USE" ]; then
            echo "export NVM_AUTO_USE=true" >> ~/.bashrc
        fi
        source ~/.nvm/nvm.sh
        echo -e "\n\n Execute again to continue installation"
        exit 1
    else
        echo "nvm already installed"
    fi
    #source ~/.nvm/nvm.sh
    nvm install
    pwd
    nvm use default
    yarn install
    yarn global add pm2
    echo "Installing PM2..."
}

start_app_first_time() {
    echo "Starting application with PM2..."
    pm2 kill || true
    pm2 start "$REMOTE_DIR/$TARGET_DIR/pm2.config.js" --update-env

}

main() {

    install_dependencies
    start_app_first_time
}

main

echo "Remote script execution complete."
EOF

scp "$REMOTE_SCRIPT_NAME" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"
rm $REMOTE_SCRIPT_NAME

}

# Function to execute the remote script
remote_execute_script() {
    echo -e "\n\n Remote: Executing script on $REMOTE_HOST..."
    ssh -t $REMOTE_USER@$REMOTE_HOST "bash -i $REMOTE_SCRIPT_NAME"
}


# Main execution flow
main_functions(){
    if [ -n "$IS_A_GITHUB_ACTION" ]; then
        echo "This script is being executed in a GitHub Actions environment."
        set_vars
        check_vars_exist
        create_tar
        update_known_hosts
        remote_clean_old_install
        remote_remove_logs
        copy_tar_to_remote
        remote_extract_files
        remote_upload_execute_script
        remote_execute_script
    else
        echo "This script is NOT being executed in a GitHub Actions environment."
        set_vars
        check_vars_exist
        cleanup_local
        remote_clean_old_install
        remote_remove_logs
        clone_repo
        create_tar
        copy_tar_to_remote
        remote_extract_files
        #remote_restore_envfiles_remotely
        remote_upload_execute_script
        remote_execute_script
        cleanup_local
    fi
}

show_help() {
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  -b <branch>   Specify the branch to deploy. Default is 'develop'."
    echo "  -r <repo>     Specify the repository URL. Default is 'git@github.com:aragon/app-backend.git'."
    echo "  -u <user>     Specify the remote user for deployment."
    echo "  -m <host>     Specify the remote host IP for deployment."
    echo "  -h            Display this help message and exit."
    echo
    echo "Example:"
    echo "  $0 -b main -r git@github.com:yourusername/yourrepo.git -u deployuser -m 192.168.1.1"
}


# Function to parse command line options
main() {
    while getopts ":b:r:u:m:h" opt; do
        case $opt in
            b)
                echo "Set branch to: $OPTARG"
                REPO_BRANCH="$OPTARG"
                ;;
            r)
                echo "Set repo URL to: $OPTARG"
                REPO_URL="$OPTARG"
                ;;
            u)
                echo "Set remote USER to: $OPTARG"
                REMOTE_USER="$OPTARG"
                ;;
            m)
                echo "Set remote machine IP to: $OPTARG"
                REMOTE_HOST="$OPTARG"
                ;;
            h)
                show_help
                exit
                ;;
            \?)
                echo "Invalid option: -$OPTARG" >&2
                ;;
            :)
                echo "Option -$OPTARG requires an argument." >&2
                ;;
        esac
    done

    # Once the input vars are set, lets run the all the functions
    main_functions
}



# Call the function to parse options
main "$@"
echo "Deployment complete."


